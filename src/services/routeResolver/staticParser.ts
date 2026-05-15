import * as fs from 'node:fs';
import * as path from 'node:path';
import PhpParserPkg from 'php-parser';
import { HttpMethod, LaravelRoute } from '../../models/route';

type AnyNode = Record<string, unknown> & { kind?: string };

const HTTP_METHOD_NAMES = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'any',
  'match'
]);

const RESOURCE_MAP: Array<{ method: HttpMethod; suffix: string; action: string }> = [
  { method: 'GET', suffix: '', action: 'index' },
  { method: 'GET', suffix: '/create', action: 'create' },
  { method: 'POST', suffix: '', action: 'store' },
  { method: 'GET', suffix: '/{id}', action: 'show' },
  { method: 'GET', suffix: '/{id}/edit', action: 'edit' },
  { method: 'PUT', suffix: '/{id}', action: 'update' },
  { method: 'DELETE', suffix: '/{id}', action: 'destroy' }
];

const API_RESOURCE_MAP = RESOURCE_MAP.filter(r => r.action !== 'create' && r.action !== 'edit');

interface ParserCtor {
  new (options: unknown): {
    parseCode(code: string, filename?: string): AnyNode;
  };
}

const Parser = ((PhpParserPkg as unknown as { Engine?: ParserCtor; default?: { Engine: ParserCtor } })
  .Engine ?? (PhpParserPkg as unknown as { default: { Engine: ParserCtor } }).default.Engine) as ParserCtor;

interface RouteContext {
  prefix: string;
  middleware: string[];
  namePrefix: string;
}

const EMPTY_CONTEXT: RouteContext = { prefix: '', middleware: [], namePrefix: '' };

export interface StaticParserOptions {
  readonly laravelRoot: string;
  readonly files?: string[];
}

export function parseRoutesFromFiles(opts: StaticParserOptions): LaravelRoute[] {
  const files = opts.files ?? defaultRouteFiles(opts.laravelRoot);
  const out: LaravelRoute[] = [];
  for (const file of files) {
    if (!fs.existsSync(file)) {
      continue;
    }
    try {
      const code = fs.readFileSync(file, 'utf-8');
      const ast = createParser().parseCode(code, file);
      walkProgram(ast, EMPTY_CONTEXT, out);
    } catch {
      continue;
    }
  }
  return out;
}

function defaultRouteFiles(laravelRoot: string): string[] {
  return ['api.php', 'web.php', 'console.php', 'channels.php']
    .map(f => path.join(laravelRoot, 'routes', f))
    .filter(p => fs.existsSync(p));
}

function createParser() {
  return new Parser({
    parser: { php8: true, suppressErrors: true },
    ast: { withPositions: true }
  });
}

function walkProgram(node: AnyNode | undefined, ctx: RouteContext, out: LaravelRoute[]): void {
  if (!node) {
    return;
  }
  const children = (node.children ?? node.body) as AnyNode[] | undefined;
  if (Array.isArray(children)) {
    for (const child of children) {
      walkStatement(child, ctx, out);
    }
  }
}

function walkStatement(node: AnyNode | undefined, ctx: RouteContext, out: LaravelRoute[]): void {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (node.kind === 'expressionstatement') {
    walkExpression(node.expression as AnyNode, ctx, out);
    return;
  }
  if (node.kind === 'if') {
    walkProgram(node.body as AnyNode, ctx, out);
    walkStatement(node.alternate as AnyNode, ctx, out);
    return;
  }
  if (node.kind === 'block') {
    walkProgram(node, ctx, out);
    return;
  }
  if (node.kind === 'expression') {
    walkExpression(node, ctx, out);
  }
}

function walkExpression(node: AnyNode | undefined, ctx: RouteContext, out: LaravelRoute[]): void {
  if (!node) {
    return;
  }

  const chain = collectMethodChain(node);
  if (!chain) {
    return;
  }

  const allCalls: ChainLink[] = [chain.head, ...chain.tail];
  const finalCall = allCalls[allCalls.length - 1];
  const modifiers = allCalls.slice(0, -1);

  let workingCtx = ctx;
  const middlewareCalls: string[][] = [];
  const prefixCalls: string[] = [];

  for (const mod of modifiers) {
    const name = mod.method.toLowerCase();
    if (name === 'prefix' && mod.args[0]) {
      const v = stringValue(mod.args[0]);
      if (v !== undefined) {
        prefixCalls.push(v);
      }
    } else if (name === 'middleware') {
      const mws = mod.args.flatMap(a => stringArrayValue(a)).filter(Boolean) as string[];
      middlewareCalls.push(mws);
    } else if (name === 'name' && mod.args[0]) {
      const v = stringValue(mod.args[0]);
      if (v !== undefined) {
        workingCtx = { ...workingCtx, namePrefix: workingCtx.namePrefix + v };
      }
    }
  }

  const finalName = finalCall.method.toLowerCase();

  if (finalName === 'group') {
    let groupCtx = applyChainToContext(workingCtx, prefixCalls, middlewareCalls);
    const arrayArg = finalCall.args.find(a => a && (a as AnyNode).kind === 'array');
    if (arrayArg) {
      groupCtx = groupContextFromArray(arrayArg as AnyNode, groupCtx);
    }
    walkGroupBody(finalCall.args[finalCall.args.length - 1] as AnyNode, groupCtx, out);
    return;
  }

  const finalCtx = applyChainToContext(workingCtx, prefixCalls, middlewareCalls);

  if (HTTP_METHOD_NAMES.has(finalName)) {
    const route = buildHttpRoute(finalName, finalCall.args, finalCtx);
    if (route) {
      out.push(route);
    }
    return;
  }

  if (finalName === 'resource' || finalName === 'apiresource') {
    const routes = buildResourceRoutes(
      finalCall.args,
      finalCtx,
      finalName === 'apiresource' ? API_RESOURCE_MAP : RESOURCE_MAP
    );
    out.push(...routes);
    return;
  }

  if (finalName === 'redirect' && finalCall.args[0]) {
    const uri = stringValue(finalCall.args[0]);
    if (uri !== undefined) {
      out.push({
        methods: ['GET'],
        uri: joinUri(finalCtx.prefix, uri),
        action: 'Illuminate\\Routing\\RedirectController',
        middleware: finalCtx.middleware.length ? finalCtx.middleware : undefined
      });
    }
  }
}

interface ChainLink {
  method: string;
  args: AnyNode[];
}

interface ChainInfo {
  head: ChainLink;
  tail: ChainLink[];
}

function collectMethodChain(node: AnyNode): ChainInfo | undefined {
  const tail: ChainLink[] = [];
  let current: AnyNode | undefined = node;
  let head: ChainLink | undefined;

  while (current && current.kind === 'call') {
    const what = current.what as AnyNode | undefined;
    const args = (current.arguments ?? []) as AnyNode[];

    if (what && what.kind === 'staticlookup') {
      const className = identifierName(what.what as AnyNode);
      if (className !== 'Route') {
        return undefined;
      }
      const methodName = identifierName(what.offset as AnyNode);
      if (!methodName) {
        return undefined;
      }
      head = { method: methodName, args };
      break;
    }

    if (what && what.kind === 'propertylookup') {
      const methodName = identifierName(what.offset as AnyNode);
      if (!methodName) {
        return undefined;
      }
      tail.unshift({ method: methodName, args });
      current = what.what as AnyNode;
      continue;
    }

    return undefined;
  }

  if (!head) {
    return undefined;
  }

  return { head, tail };
}

function identifierName(node: AnyNode | undefined): string | undefined {
  if (!node) {
    return undefined;
  }
  if (node.kind === 'identifier' || node.kind === 'name') {
    return (node.name as string | undefined) ?? undefined;
  }
  if (typeof node.name === 'string') {
    return node.name;
  }
  return undefined;
}

function applyChainToContext(
  base: RouteContext,
  prefixCalls: string[],
  middlewareCalls: string[][]
): RouteContext {
  return {
    prefix: prefixCalls.reduce((acc, p) => joinUri(acc, p), base.prefix),
    middleware: [...base.middleware, ...middlewareCalls.flat()],
    namePrefix: base.namePrefix
  };
}

function groupContextFromArray(arr: AnyNode, base: RouteContext): RouteContext {
  const items = (arr.items ?? []) as AnyNode[];
  let prefix = base.prefix;
  let middleware = [...base.middleware];
  let namePrefix = base.namePrefix;

  for (const it of items) {
    const key = (it.key as AnyNode | undefined);
    const value = it.value as AnyNode | undefined;
    const k = stringValue(key);
    if (!k || !value) {
      continue;
    }
    if (k === 'prefix') {
      const v = stringValue(value);
      if (v !== undefined) {
        prefix = joinUri(prefix, v);
      }
    } else if (k === 'middleware') {
      const mws = stringArrayValue(value);
      middleware = [...middleware, ...mws];
    } else if (k === 'as') {
      const v = stringValue(value);
      if (v !== undefined) {
        namePrefix = namePrefix + v;
      }
    }
  }
  return { prefix, middleware, namePrefix };
}

function walkGroupBody(node: AnyNode | undefined, ctx: RouteContext, out: LaravelRoute[]): void {
  if (!node) {
    return;
  }
  if (node.kind === 'closure' || node.kind === 'arrowfunc') {
    const body = node.body as AnyNode | undefined;
    walkProgram(body, ctx, out);
    return;
  }
  if (typeof node === 'string' || (node.kind === 'string' && typeof node.value === 'string')) {
    const filePath = stringValue(node);
    if (filePath) {
      try {
        const code = fs.readFileSync(filePath, 'utf-8');
        const ast = createParser().parseCode(code, filePath);
        walkProgram(ast, ctx, out);
      } catch {
        return;
      }
    }
  }
}

function buildHttpRoute(method: string, args: AnyNode[], ctx: RouteContext): LaravelRoute | undefined {
  if (args.length < 1) {
    return undefined;
  }
  let methods: HttpMethod[];
  let uriArg: AnyNode;
  let actionArg: AnyNode | undefined;

  if (method === 'match') {
    if (args.length < 3) {
      return undefined;
    }
    methods = stringArrayValue(args[0]).map(v => v.toUpperCase() as HttpMethod);
    if (methods.length === 0) {
      methods = ['ANY'];
    }
    uriArg = args[1];
    actionArg = args[2];
  } else if (method === 'any') {
    methods = ['ANY'];
    uriArg = args[0];
    actionArg = args[1];
  } else {
    methods = [method.toUpperCase() as HttpMethod];
    uriArg = args[0];
    actionArg = args[1];
  }

  const uri = stringValue(uriArg);
  if (uri === undefined) {
    return undefined;
  }

  const action = extractAction(actionArg);
  const { controller, controllerMethod } = splitAction(action);

  return {
    methods,
    uri: joinUri(ctx.prefix, uri),
    action,
    controller,
    controllerMethod,
    middleware: ctx.middleware.length ? ctx.middleware : undefined
  };
}

function buildResourceRoutes(
  args: AnyNode[],
  ctx: RouteContext,
  template: typeof RESOURCE_MAP
): LaravelRoute[] {
  if (args.length < 2) {
    return [];
  }
  const baseUri = stringValue(args[0]);
  const controllerName = extractClassName(args[1]) ?? stringValue(args[1]);
  if (!baseUri || !controllerName) {
    return [];
  }
  return template.map(t => ({
    methods: [t.method],
    uri: joinUri(joinUri(ctx.prefix, baseUri), t.suffix),
    action: `${controllerName}@${t.action}`,
    controller: controllerName,
    controllerMethod: t.action,
    middleware: ctx.middleware.length ? ctx.middleware : undefined
  }));
}

function extractAction(node: AnyNode | undefined): string {
  if (!node) {
    return 'Closure';
  }
  if (node.kind === 'string') {
    return (node.value as string | undefined) ?? 'Closure';
  }
  if (node.kind === 'array') {
    const items = (node.items ?? []) as AnyNode[];
    if (items.length >= 2) {
      const cls = extractClassName(items[0].value as AnyNode);
      const method = stringValue(items[1].value as AnyNode);
      if (cls && method) {
        return `${cls}@${method}`;
      }
    }
  }
  if (node.kind === 'closure' || node.kind === 'arrowfunc') {
    return 'Closure';
  }
  if (node.kind === 'staticlookup') {
    const cls = extractClassName(node);
    if (cls) {
      return cls;
    }
  }
  return 'Closure';
}

function extractClassName(node: AnyNode | undefined): string | undefined {
  if (!node) {
    return undefined;
  }
  if (node.kind === 'staticlookup') {
    const offset = node.offset as AnyNode | undefined;
    if (offset && identifierName(offset) === 'class') {
      const what = node.what as AnyNode | undefined;
      return identifierName(what) ?? (what ? (what.name as string | undefined) : undefined);
    }
  }
  if (node.kind === 'classreference' || node.kind === 'name') {
    return node.name as string | undefined;
  }
  if (node.kind === 'string') {
    return (node.value as string | undefined) ?? undefined;
  }
  return undefined;
}

function stringValue(node: AnyNode | undefined): string | undefined {
  if (!node || typeof node !== 'object') {
    return undefined;
  }
  if (node.kind === 'string') {
    return (node.value as string | undefined) ?? undefined;
  }
  if (node.kind === 'encapsed') {
    const parts = (node.value ?? []) as AnyNode[];
    let result = '';
    for (const p of parts) {
      if (p.kind === 'string') {
        result += (p.value as string | undefined) ?? '';
      } else {
        return undefined;
      }
    }
    return result;
  }
  return undefined;
}

function stringArrayValue(node: AnyNode | undefined): string[] {
  if (!node) {
    return [];
  }
  if (node.kind === 'string') {
    return [(node.value as string | undefined) ?? ''];
  }
  if (node.kind === 'array') {
    const items = (node.items ?? []) as AnyNode[];
    const out: string[] = [];
    for (const it of items) {
      const v = stringValue(it.value as AnyNode);
      if (v !== undefined) {
        out.push(v);
      }
    }
    return out;
  }
  return [];
}

function joinUri(a: string, b: string): string {
  const left = a.replace(/\/+$/, '');
  const right = b.replace(/^\/+/, '');
  if (!left) {
    return right ? '/' + right : '/';
  }
  if (!right) {
    return left || '/';
  }
  return (left.startsWith('/') ? left : '/' + left) + '/' + right;
}

function splitAction(action: string): { controller?: string; controllerMethod?: string } {
  if (action === 'Closure') {
    return {};
  }
  const at = action.lastIndexOf('@');
  if (at === -1) {
    return { controller: action };
  }
  return {
    controller: action.slice(0, at),
    controllerMethod: action.slice(at + 1)
  };
}
