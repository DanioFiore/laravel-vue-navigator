import * as fs from 'node:fs';
import * as path from 'node:path';
import { LaravelRoute, ResolvedLocation } from '../models/route';

export interface ControllerLocatorOptions {
  readonly laravelRoot: string;
}

interface Psr4Entry {
  readonly namespacePrefix: string;
  readonly directories: string[];
}

interface ComposerAutoload {
  classmap: Map<string, string>;
  psr4: Psr4Entry[];
}

const composerCache = new Map<string, ComposerAutoload>();

export function locateController(
  route: LaravelRoute,
  opts: ControllerLocatorOptions
): ResolvedLocation | undefined {
  if (!route.controller) {
    return undefined;
  }
  const fqcn = normalizeFqcn(route.controller);
  const filePath = resolveControllerFile(fqcn, opts.laravelRoot);
  if (!filePath || !fs.existsSync(filePath)) {
    return undefined;
  }
  const methodName = route.controllerMethod ?? '__invoke';
  return findMethodLocation(filePath, methodName);
}

export function clearComposerCache(): void {
  composerCache.clear();
}

function resolveControllerFile(fqcn: string, laravelRoot: string): string | undefined {
  const autoload = loadAutoload(laravelRoot);
  const direct = autoload.classmap.get(fqcn);
  if (direct) {
    return path.isAbsolute(direct) ? direct : path.join(laravelRoot, direct);
  }
  const sorted = [...autoload.psr4].sort(
    (a, b) => b.namespacePrefix.length - a.namespacePrefix.length
  );
  for (const entry of sorted) {
    if (!fqcn.startsWith(entry.namespacePrefix)) {
      continue;
    }
    const remainder = fqcn.slice(entry.namespacePrefix.length);
    const subPath = remainder.replace(/\\/g, path.sep) + '.php';
    for (const dir of entry.directories) {
      const candidate = path.join(laravelRoot, dir, subPath);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return guessByConvention(fqcn, laravelRoot);
}

function guessByConvention(fqcn: string, laravelRoot: string): string | undefined {
  if (!fqcn.startsWith('App\\')) {
    return undefined;
  }
  const remainder = fqcn.slice('App\\'.length).replace(/\\/g, path.sep) + '.php';
  const candidate = path.join(laravelRoot, 'app', remainder);
  return fs.existsSync(candidate) ? candidate : undefined;
}

function loadAutoload(laravelRoot: string): ComposerAutoload {
  const cached = composerCache.get(laravelRoot);
  if (cached) {
    return cached;
  }
  const composerPath = path.join(laravelRoot, 'composer.json');
  const empty: ComposerAutoload = { classmap: new Map(), psr4: [] };
  if (!fs.existsSync(composerPath)) {
    composerCache.set(laravelRoot, empty);
    return empty;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(composerPath, 'utf-8')) as {
      autoload?: { 'psr-4'?: Record<string, string | string[]>; classmap?: string[] };
      'autoload-dev'?: { 'psr-4'?: Record<string, string | string[]> };
    };
    const psr4Entries: Psr4Entry[] = [];
    const mergePsr4 = (map?: Record<string, string | string[]>): void => {
      if (!map) {
        return;
      }
      for (const [namespacePrefix, value] of Object.entries(map)) {
        const dirs = Array.isArray(value) ? value : [value];
        psr4Entries.push({
          namespacePrefix: ensureBackslashSuffix(namespacePrefix),
          directories: dirs.map(d => d.replace(/\/$/, ''))
        });
      }
    };
    mergePsr4(raw.autoload?.['psr-4']);
    mergePsr4(raw['autoload-dev']?.['psr-4']);
    const result: ComposerAutoload = { classmap: new Map(), psr4: psr4Entries };
    composerCache.set(laravelRoot, result);
    return result;
  } catch {
    composerCache.set(laravelRoot, empty);
    return empty;
  }
}

function normalizeFqcn(name: string): string {
  let s = name.trim();
  if (s.startsWith('\\')) {
    s = s.slice(1);
  }
  return s;
}

function ensureBackslashSuffix(prefix: string): string {
  return prefix.endsWith('\\') ? prefix : prefix + '\\';
}

function findMethodLocation(filePath: string, methodName: string): ResolvedLocation {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const re = new RegExp(
    String.raw`^\s*(?:public|protected|private)?\s*(?:static\s+)?function\s+` +
      escapeRegExp(methodName) +
      String.raw`\s*\(`
  );
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      const col = Math.max(0, lines[i].indexOf('function'));
      return { file: filePath, line: i, column: col };
    }
  }
  return { file: filePath, line: 0, column: 0 };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
