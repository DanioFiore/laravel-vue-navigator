import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import * as t from '@babel/types';
import { ExtractedEndpoint, HttpMethod } from '../../models/route';
import { findContainingScript } from './vueScript';

const traverse = (traverseModule as unknown as { default?: typeof traverseModule }).default ?? traverseModule;

const HTTP_VERBS: Record<string, HttpMethod> = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  delete: 'DELETE',
  options: 'OPTIONS',
  head: 'HEAD',
  request: 'ANY'
};

export interface ExtractionInput {
  readonly languageId: string;
  readonly source: string;
  readonly line: number;
  readonly character: number;
}

export function extractEndpointAt(input: ExtractionInput): ExtractedEndpoint | undefined {
  const block = prepareSource(input);
  if (!block) {
    return undefined;
  }

  let ast: t.File;
  try {
    ast = parse(block.code, {
      sourceType: 'module',
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      errorRecovery: true,
      plugins: pickPlugins(block.lang)
    });
  } catch {
    return undefined;
  }

  const targetLine = input.line - block.lineOffset + 1;
  const targetColumn = input.line === block.lineOffset
    ? input.character - block.columnOffset
    : input.character;

  let found: ExtractedEndpoint | undefined;

  traverse(ast, {
    CallExpression(path) {
      const node = path.node;
      if (!nodeContainsPosition(node, targetLine, targetColumn)) {
        return;
      }
      const candidate = tryExtractFromCall(node);
      if (!candidate) {
        return;
      }
      const urlArgNode = locateUrlArgNode(node);
      if (urlArgNode && !nodeContainsPosition(urlArgNode, targetLine, targetColumn)) {
        return;
      }
      found = candidate;
      path.stop();
    }
  });

  return found;
}

interface PreparedBlock {
  readonly code: string;
  readonly lineOffset: number;
  readonly columnOffset: number;
  readonly lang: 'ts' | 'js';
}

function prepareSource(input: ExtractionInput): PreparedBlock | undefined {
  if (input.languageId === 'vue') {
    const block = findContainingScript(input.source, input.line, input.character);
    if (!block) {
      return undefined;
    }
    return {
      code: block.content,
      lineOffset: block.lineOffset,
      columnOffset: block.columnOffset,
      lang: block.lang
    };
  }

  const lang: 'ts' | 'js' =
    input.languageId === 'typescript' || input.languageId === 'typescriptreact' ? 'ts' : 'js';

  return {
    code: input.source,
    lineOffset: 0,
    columnOffset: 0,
    lang
  };
}

function pickPlugins(lang: 'ts' | 'js'): import('@babel/parser').ParserPlugin[] {
  const base: import('@babel/parser').ParserPlugin[] = ['jsx', 'decorators-legacy'];
  if (lang === 'ts') {
    base.unshift('typescript');
  }
  return base;
}

function nodeContainsPosition(node: t.Node, line: number, column: number): boolean {
  const start = node.loc?.start;
  const end = node.loc?.end;
  if (!start || !end) {
    return false;
  }
  if (line < start.line || line > end.line) {
    return false;
  }
  if (line === start.line && column < start.column) {
    return false;
  }
  if (line === end.line && column > end.column) {
    return false;
  }
  return true;
}

function locateUrlArgNode(call: t.CallExpression): t.Node | undefined {
  if (call.arguments.length === 0) {
    return undefined;
  }
  const first = call.arguments[0];
  if (t.isObjectExpression(first)) {
    for (const prop of first.properties) {
      if (t.isObjectProperty(prop) && propKeyEquals(prop, 'url')) {
        return prop.value;
      }
    }
    return undefined;
  }
  return first;
}

function tryExtractFromCall(call: t.CallExpression): ExtractedEndpoint | undefined {
  const callee = call.callee;

  if (t.isMemberExpression(callee) && !callee.computed) {
    const propName = identifierName(callee.property);
    if (!propName) {
      return undefined;
    }
    const verb = HTTP_VERBS[propName.toLowerCase()];
    if (!verb) {
      return undefined;
    }
    if (!looksLikeHttpClient(callee.object)) {
      return undefined;
    }
    const urlArg = call.arguments[0];
    const pattern = patternFromArg(urlArg);
    if (pattern === undefined) {
      return undefined;
    }
    return { pattern, verb: verb === 'ANY' ? undefined : verb };
  }

  if (
    t.isIdentifier(callee) &&
    /^(axios|http|api|client)$/i.test(callee.name) &&
    call.arguments.length >= 1
  ) {
    const firstArg = call.arguments[0];
    if (t.isObjectExpression(firstArg)) {
      let urlPattern: string | undefined;
      let verb: HttpMethod | undefined;
      for (const prop of firstArg.properties) {
        if (!t.isObjectProperty(prop)) {
          continue;
        }
        if (propKeyEquals(prop, 'url')) {
          urlPattern = patternFromArg(prop.value);
        } else if (propKeyEquals(prop, 'method')) {
          const v = patternFromArg(prop.value);
          if (v) {
            verb = v.toUpperCase() as HttpMethod;
          }
        }
      }
      if (urlPattern !== undefined) {
        return { pattern: urlPattern, verb };
      }
    } else {
      const pattern = patternFromArg(firstArg);
      if (pattern !== undefined) {
        return { pattern, verb: undefined };
      }
    }
  }

  return undefined;
}

function looksLikeHttpClient(node: t.Node): boolean {
  if (t.isIdentifier(node)) {
    return /^(axios|http|api|client|instance|\$http|\$api)$/i.test(node.name);
  }
  if (t.isMemberExpression(node) && !node.computed) {
    const propName = identifierName(node.property);
    if (propName && /^(http|api|client|axios|instance)$/i.test(propName)) {
      return true;
    }
    return looksLikeHttpClient(node.object);
  }
  if (t.isThisExpression(node)) {
    return false;
  }
  if (t.isCallExpression(node)) {
    return looksLikeHttpClient(node.callee);
  }
  return false;
}

function identifierName(node: t.Node | undefined): string | undefined {
  if (!node) {
    return undefined;
  }
  if (t.isIdentifier(node)) {
    return node.name;
  }
  if (t.isStringLiteral(node)) {
    return node.value;
  }
  return undefined;
}

function propKeyEquals(prop: t.ObjectProperty, expected: string): boolean {
  if (t.isIdentifier(prop.key)) {
    return prop.key.name === expected;
  }
  if (t.isStringLiteral(prop.key)) {
    return prop.key.value === expected;
  }
  return false;
}

function patternFromArg(node: t.Node | t.SpreadElement | t.ArgumentPlaceholder | undefined): string | undefined {
  if (!node) {
    return undefined;
  }
  if (t.isStringLiteral(node)) {
    return node.value;
  }
  if (t.isTemplateLiteral(node)) {
    let out = '';
    for (let i = 0; i < node.quasis.length; i++) {
      out += node.quasis[i].value.cooked ?? node.quasis[i].value.raw;
      if (i < node.expressions.length) {
        out += '{param}';
      }
    }
    return out;
  }
  if (t.isTSAsExpression(node) || t.isTSSatisfiesExpression(node) || t.isTSNonNullExpression(node)) {
    return patternFromArg((node as { expression: t.Node }).expression);
  }
  if (t.isBinaryExpression(node) && node.operator === '+') {
    const left = patternFromArg(node.left);
    const right = patternFromArg(node.right);
    if (left !== undefined && right !== undefined) {
      return left + right;
    }
  }
  return undefined;
}
