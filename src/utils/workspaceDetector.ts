import * as path from 'node:path';
import * as fs from 'node:fs';
import * as vscode from 'vscode';

const MAX_SCAN_DEPTH = 3;
const IGNORE_DIRS = new Set([
  'node_modules',
  'vendor',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  'storage',
  'public'
]);

export interface DetectedPaths {
  readonly laravelRoot: string | undefined;
  readonly frontendRoot: string | undefined;
}

export function getWorkspaceRoots(): string[] {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return [];
  }
  return folders.map(folder => folder.uri.fsPath);
}

export function getWorkspaceRoot(): string | undefined {
  return getWorkspaceRoots()[0];
}

export function resolveLaravelRoot(configured: string): string | undefined {
  const roots = getWorkspaceRoots();
  if (roots.length === 0) {
    return undefined;
  }

  if (configured && configured !== 'auto') {
    for (const root of roots) {
      const absolutePath = path.isAbsolute(configured) ? configured : path.join(root, configured);
      if (fs.existsSync(path.join(absolutePath, 'artisan'))) {
        return absolutePath;
      }
    }
    return undefined;
  }

  for (const root of roots) {
    const found = findLaravelRoot(root);
    if (found) {
      return found;
    }
  }
  return undefined;
}

export function resolveFrontendRoot(configured: string): string | undefined {
  const roots = getWorkspaceRoots();
  if (roots.length === 0) {
    return undefined;
  }

  if (configured && configured !== 'auto') {
    for (const root of roots) {
      const absolutePath = path.isAbsolute(configured) ? configured : path.join(root, configured);
      if (fs.existsSync(absolutePath)) {
        return absolutePath;
      }
    }
    return undefined;
  }

  for (const root of roots) {
    const found = findFrontendRoot(root);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function findLaravelRoot(start: string): string | undefined {
  return scanForMarker(start, 0, directory => fs.existsSync(path.join(directory, 'artisan')));
}

function findFrontendRoot(start: string): string | undefined {
  return scanForMarker(start, 0, directory => {
    const packageJsonPath = path.join(directory, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return false;
    }
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const dependencies = {
        ...(packageJson.dependencies ?? {}),
        ...(packageJson.devDependencies ?? {})
      };
      return Boolean(
        dependencies.vue || dependencies.nuxt || dependencies['@vue/runtime-core']
      );
    } catch {
      return false;
    }
  });
}

function scanForMarker(
  directory: string,
  depth: number,
  predicate: (directory: string) => boolean
): string | undefined {
  if (depth > MAX_SCAN_DEPTH) {
    return undefined;
  }
  if (predicate(directory)) {
    return directory;
  }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return undefined;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (entry.name.startsWith('.') && entry.name !== '.') {
      continue;
    }
    if (IGNORE_DIRS.has(entry.name)) {
      continue;
    }
    const found = scanForMarker(path.join(directory, entry.name), depth + 1, predicate);
    if (found) {
      return found;
    }
  }
  return undefined;
}

export function detectPaths(configuredLaravel: string, configuredFrontend: string): DetectedPaths {
  return {
    laravelRoot: resolveLaravelRoot(configuredLaravel),
    frontendRoot: resolveFrontendRoot(configuredFrontend)
  };
}
