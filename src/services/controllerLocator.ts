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
  options: ControllerLocatorOptions
): ResolvedLocation | undefined {
  if (!route.controller) {
    return undefined;
  }
  const methodName = route.controllerMethod ?? '__invoke';
  for (const fqcn of controllerFqcnCandidates(route.controller, options.laravelRoot)) {
    const filePath = resolveControllerFileForFqcn(fqcn, options.laravelRoot);
    if (!filePath || !fs.existsSync(filePath)) {
      continue;
    }
    return findMethodLocation(filePath, methodName);
  }
  return undefined;
}

export function clearComposerCache(): void {
  composerCache.clear();
}

/**
 * The static route parser often emits short class names (e.g. `UserController` from
 * `[UserController::class, 'index']`). Artisan emits full FQCNs. Try common
 * Laravel namespaces before giving up.
 */
function controllerFqcnCandidates(controller: string, laravelRoot: string): string[] {
  const base = normalizeFqcn(controller);
  if (base.includes('\\')) {
    return [base];
  }
  const candidates = new Set<string>([`App\\Http\\Controllers\\${base}`, base]);
  for (const entry of loadAutoload(laravelRoot).psr4) {
    if (
      entry.namespacePrefix.endsWith('Controllers\\') ||
      entry.directories.some(directory => /Http[/\\]Controllers/.test(directory))
    ) {
      candidates.add(entry.namespacePrefix + base);
    }
  }
  return [...candidates];
}

function resolveControllerFileForFqcn(fqcn: string, laravelRoot: string): string | undefined {
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
    for (const directory of entry.directories) {
      const candidate = path.join(laravelRoot, directory, subPath);
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
        const directories = Array.isArray(value) ? value : [value];
        psr4Entries.push({
          namespacePrefix: ensureBackslashSuffix(namespacePrefix),
          directories: directories.map(directory => directory.replace(/\/$/, ''))
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
  let normalized = name.trim();
  if (normalized.startsWith('\\')) {
    normalized = normalized.slice(1);
  }
  return normalized;
}

function ensureBackslashSuffix(prefix: string): string {
  return prefix.endsWith('\\') ? prefix : prefix + '\\';
}

function findMethodLocation(filePath: string, methodName: string): ResolvedLocation {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const methodPattern = new RegExp(
    String.raw`^\s*(?:public|protected|private)?\s*(?:static\s+)?function\s+` +
      escapeRegExp(methodName) +
      String.raw`\s*\(`
  );
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    if (methodPattern.test(lines[lineIndex])) {
      const column = Math.max(0, lines[lineIndex].indexOf('function'));
      return { file: filePath, line: lineIndex, column };
    }
  }
  return { file: filePath, line: 0, column: 0 };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
