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

const API_RESOURCE_MAP = RESOURCE_MAP.filter(
  resource => resource.action !== 'create' && resource.action !== 'edit'
);

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
  /** Laravel bootstrap prefix for routes/api.php (e.g. /api). Applied only to api.php parses. */
  readonly apiRoutePrefix?: string;
}

export function parseRoutesFromFiles(options: StaticParserOptions): LaravelRoute[] {
  const files = options.files ?? defaultRouteFiles(options.laravelRoot);
  const routes: LaravelRoute[] = [];
  for (const file of files) {
    if (!fs.existsSync(file)) {
      continue;
    }
    try {
      const code = fs.readFileSync(file, 'utf-8');
      const ast = createParser().parseCode(code, file);
      const fileRoutes: LaravelRoute[] = [];
      walkProgram(ast, EMPTY_CONTEXT, fileRoutes, options.laravelRoot);
      if (isApiRoutesFile(file)) {
        const prefix = options.apiRoutePrefix ?? '';
        routes.push(...fileRoutes.map(route => ({ ...route, uri: applyExternalPrefix(route.uri, prefix) })));
      } else {
        routes.push(...fileRoutes);
      }
    } catch {
      continue;
    }
  }
  return routes;
}

function isApiRoutesFile(filePath: string): boolean {
  return filePath.replace(/\\/g, '/').endsWith('/routes/api.php');
}

function applyExternalPrefix(uri: string, prefix: string): string {
  if (!prefix) {
    return uri;
  }
  const base = prefix.replace(/\/+$/, '');
  const normalized = uri.startsWith('/') ? uri : `/${uri}`;
  if (normalized === base || normalized.startsWith(`${base}/`)) {
    return normalized;
  }
  return joinUri(base, normalized);
}

function defaultRouteFiles(laravelRoot: string): string[] {
  return ['api.php', 'web.php', 'console.php', 'channels.php']
    .map(fileName => path.join(laravelRoot, 'routes', fileName))
    .filter(filePath => fs.existsSync(filePath));
}

function createParser() {
  return new Parser({
    parser: { php8: true, suppressErrors: true },
    ast: { withPositions: true }
  });
}

function walkProgram(
  node: AnyNode | undefined,
  context: RouteContext,
  routes: LaravelRoute[],
  laravelRoot: string
): void {
  if (!node) {
    return;
  }
  const children = (node.children ?? node.body) as AnyNode[] | undefined;
  if (Array.isArray(children)) {
    for (const child of children) {
      walkStatement(child, context, routes, laravelRoot);
    }
  }
}

function walkStatement(
  node: AnyNode | undefined,
  context: RouteContext,
  routes: LaravelRoute[],
  laravelRoot: string
): void {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (node.kind === 'expressionstatement') {
    walkExpression(node.expression as AnyNode, context, routes, laravelRoot);
    return;
  }
  if (node.kind === 'if') {
    walkProgram(node.body as AnyNode, context, routes, laravelRoot);
    walkStatement(node.alternate as AnyNode, context, routes, laravelRoot);
    return;
  }
  if (node.kind === 'block') {
    walkProgram(node, context, routes, laravelRoot);
    return;
  }
  if (node.kind === 'expression') {
    walkExpression(node, context, routes, laravelRoot);
  }
}

function walkExpression(
  node: AnyNode | undefined,
  context: RouteContext,
  routes: LaravelRoute[],
  laravelRoot: string
): void {
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

  let workingContext = context;
  const middlewareCalls: string[][] = [];
  const prefixCalls: string[] = [];

  for (const modifier of modifiers) {
    const name = modifier.method.toLowerCase();
    if (name === 'prefix' && modifier.args[0]) {
      const prefixValue = stringValue(modifier.args[0]);
      if (prefixValue !== undefined) {
        prefixCalls.push(prefixValue);
      }
    } else if (name === 'middleware') {
      const middlewareNames = modifier.args
        .flatMap(argument => stringArrayValue(argument))
        .filter(Boolean) as string[];
      middlewareCalls.push(middlewareNames);
    } else if (name === 'name' && modifier.args[0]) {
      const nameValue = stringValue(modifier.args[0]);
      if (nameValue !== undefined) {
        workingContext = {
          ...workingContext,
          namePrefix: workingContext.namePrefix + nameValue
        };
      }
    }
  }

  const finalName = finalCall.method.toLowerCase();

  if (finalName === 'group') {
    let groupContext = applyChainToContext(workingContext, prefixCalls, middlewareCalls);
    const arrayArg = finalCall.args.find(
      argument => argument && (argument as AnyNode).kind === 'array'
    );
    if (arrayArg) {
      groupContext = groupContextFromArray(arrayArg as AnyNode, groupContext);
    }
    walkGroupBody(
      finalCall.args[finalCall.args.length - 1] as AnyNode,
      groupContext,
      routes,
      laravelRoot
    );
    return;
  }

  const finalContext = applyChainToContext(workingContext, prefixCalls, middlewareCalls);

  if (HTTP_METHOD_NAMES.has(finalName)) {
    const route = buildHttpRoute(finalName, finalCall.args, finalContext);
    if (route) {
      routes.push(route);
    }
    return;
  }

  if (finalName === 'resource' || finalName === 'apiresource') {
    const resourceRoutes = buildResourceRoutes(
      finalCall.args,
      finalContext,
      finalName === 'apiresource' ? API_RESOURCE_MAP : RESOURCE_MAP
    );
    routes.push(...resourceRoutes);
    return;
  }

  if (finalName === 'resources' || finalName === 'apiresources') {
    const resourceRoutes = buildResourcesFromArray(
      finalCall.args[0],
      finalContext,
      finalName === 'apiresources' ? API_RESOURCE_MAP : RESOURCE_MAP
    );
    routes.push(...resourceRoutes);
    return;
  }

  if (finalName === 'redirect' && finalCall.args[0]) {
    const uri = stringValue(finalCall.args[0]);
    if (uri !== undefined) {
      routes.push({
        methods: ['GET'],
        uri: joinUri(finalContext.prefix, uri),
        action: 'Illuminate\\Routing\\RedirectController',
        middleware: finalContext.middleware.length ? finalContext.middleware : undefined
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
    prefix: prefixCalls.reduce((accumulator, prefix) => joinUri(accumulator, prefix), base.prefix),
    middleware: [...base.middleware, ...middlewareCalls.flat()],
    namePrefix: base.namePrefix
  };
}

function groupContextFromArray(arrayNode: AnyNode, base: RouteContext): RouteContext {
  const items = (arrayNode.items ?? []) as AnyNode[];
  let prefix = base.prefix;
  let middleware = [...base.middleware];
  let namePrefix = base.namePrefix;

  for (const item of items) {
    const keyNode = item.key as AnyNode | undefined;
    const valueNode = item.value as AnyNode | undefined;
    const key = stringValue(keyNode);
    if (!key || !valueNode) {
      continue;
    }
    if (key === 'prefix') {
      const prefixValue = stringValue(valueNode);
      if (prefixValue !== undefined) {
        prefix = joinUri(prefix, prefixValue);
      }
    } else if (key === 'middleware') {
      const middlewareNames = stringArrayValue(valueNode);
      middleware = [...middleware, ...middlewareNames];
    } else if (key === 'as') {
      const nameValue = stringValue(valueNode);
      if (nameValue !== undefined) {
        namePrefix = namePrefix + nameValue;
      }
    }
  }
  return { prefix, middleware, namePrefix };
}

function walkGroupBody(
  node: AnyNode | undefined,
  context: RouteContext,
  routes: LaravelRoute[],
  laravelRoot: string
): void {
  if (!node) {
    return;
  }
  if (node.kind === 'closure' || node.kind === 'arrowfunc') {
    const body = node.body as AnyNode | undefined;
    walkProgram(body, context, routes, laravelRoot);
    return;
  }
  const filePath = resolveIncludedRouteFile(node, laravelRoot);
  if (!filePath) {
    return;
  }
  try {
    const code = fs.readFileSync(filePath, 'utf-8');
    const ast = createParser().parseCode(code, filePath);
    walkProgram(ast, context, routes, laravelRoot);
  } catch {
    return;
  }
}

/** Resolves Route::group(base_path('routes/...')) and plain string paths to absolute files. */
function resolveIncludedRouteFile(node: AnyNode | undefined, laravelRoot: string): string | undefined {
  if (!node) {
    return undefined;
  }
  const direct = stringValue(node);
  if (direct) {
    if (path.isAbsolute(direct) && fs.existsSync(direct)) {
      return direct;
    }
    const fromRoot = path.join(laravelRoot, direct);
    if (fs.existsSync(fromRoot)) {
      return fromRoot;
    }
  }
  if (node.kind !== 'call') {
    return undefined;
  }
  const functionName = identifierName(node.what as AnyNode);
  const args = (node.arguments ?? []) as AnyNode[];
  if (!functionName || args.length === 0) {
    return undefined;
  }
  const relative = stringValue(args[0]);
  if (!relative) {
    return undefined;
  }
  if (functionName === 'base_path' || functionName === 'app_path') {
    const absolutePath = path.join(laravelRoot, relative);
    return fs.existsSync(absolutePath) ? absolutePath : undefined;
  }
  return undefined;
}

function buildHttpRoute(method: string, args: AnyNode[], context: RouteContext): LaravelRoute | undefined {
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
    methods = stringArrayValue(args[0]).map(value => value.toUpperCase() as HttpMethod);
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
    uri: joinUri(context.prefix, uri),
    action,
    controller,
    controllerMethod,
    middleware: context.middleware.length ? context.middleware : undefined
  };
}

function buildResourceRoutes(
  args: AnyNode[],
  context: RouteContext,
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
  return buildResourceRoutesForEntry(baseUri, controllerName, context, template);
}

function buildResourcesFromArray(
  arrayNode: AnyNode | undefined,
  context: RouteContext,
  template: typeof RESOURCE_MAP
): LaravelRoute[] {
  if (!arrayNode || arrayNode.kind !== 'array') {
    return [];
  }
  const items = (arrayNode.items ?? []) as AnyNode[];
  const routes: LaravelRoute[] = [];
  for (const item of items) {
    const baseUri = stringValue(item.key as AnyNode);
    if (!baseUri) {
      continue;
    }
    const valueNode = item.value as AnyNode;
    const controllerName = extractClassName(valueNode) ?? stringValue(valueNode);
    if (!controllerName) {
      continue;
    }
    routes.push(...buildResourceRoutesForEntry(baseUri, controllerName, context, template));
  }
  return routes;
}

function buildResourceRoutesForEntry(
  baseUri: string,
  controllerName: string,
  context: RouteContext,
  template: typeof RESOURCE_MAP
): LaravelRoute[] {
  const param = deriveResourceParameter(baseUri);
  return template.map(resourceAction => ({
    methods: [resourceAction.method],
    uri: joinUri(
      joinUri(context.prefix, baseUri),
      substituteResourceParam(resourceAction.suffix, param)
    ),
    action: `${controllerName}@${resourceAction.action}`,
    controller: controllerName,
    controllerMethod: resourceAction.action,
    middleware: context.middleware.length ? context.middleware : undefined
  }));
}

/** Laravel derives the wildcard from the last URI segment (Str::singular). */
function deriveResourceParameter(baseUri: string): string {
  const segments = baseUri.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const last = segments[segments.length - 1] ?? '';
  if (last.startsWith('{') && last.endsWith('}')) {
    return last;
  }
  return `{${singularizeSegment(last)}}`;
}

function singularizeSegment(segment: string): string {
  if (segment.endsWith('ies') && segment.length > 3) {
    return segment.slice(0, -3) + 'y';
  }
  if (
    segment.endsWith('ses') ||
    segment.endsWith('xes') ||
    segment.endsWith('zes') ||
    segment.endsWith('ches') ||
    segment.endsWith('shes')
  ) {
    return segment.slice(0, -2);
  }
  if (segment.endsWith('s') && !segment.endsWith('ss')) {
    return segment.slice(0, -1);
  }
  return segment;
}

function substituteResourceParam(suffix: string, param: string): string {
  return suffix.replace(/\{id\}/g, param);
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
      const className = extractClassName(items[0].value as AnyNode);
      const method = stringValue(items[1].value as AnyNode);
      if (className && method) {
        return `${className}@${method}`;
      }
    }
  }
  if (node.kind === 'closure' || node.kind === 'arrowfunc') {
    return 'Closure';
  }
  if (node.kind === 'staticlookup') {
    const className = extractClassName(node);
    if (className) {
      return className;
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
    for (const part of parts) {
      if (part.kind === 'string') {
        result += (part.value as string | undefined) ?? '';
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
    const values: string[] = [];
    for (const item of items) {
      const value = stringValue(item.value as AnyNode);
      if (value !== undefined) {
        values.push(value);
      }
    }
    return values;
  }
  return [];
}

function joinUri(leftPart: string, rightPart: string): string {
  const left = leftPart.replace(/\/+$/, '');
  const right = rightPart.replace(/^\/+/, '');
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
  const atIndex = action.lastIndexOf('@');
  if (atIndex === -1) {
    return { controller: action };
  }
  return {
    controller: action.slice(0, atIndex),
    controllerMethod: action.slice(atIndex + 1)
  };
}
