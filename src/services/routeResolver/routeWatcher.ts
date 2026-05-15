import * as path from 'node:path';
import * as vscode from 'vscode';
import { debounce } from '../../utils/debounce';

export interface RouteWatcherOptions {
  readonly laravelRoot: string;
  readonly debounceMs: number;
  readonly onRefresh: () => void | Promise<void>;
}

const RELATIVE_GLOBS = [
  'routes/**/*.php',
  'app/Http/Controllers/**/*.php',
  'app/Providers/**/*.php'
];

export function createRouteWatcher(opts: RouteWatcherOptions): vscode.Disposable {
  const disposables: vscode.Disposable[] = [];
  const trigger = debounce(() => {
    Promise.resolve(opts.onRefresh()).catch(() => {
      /* swallow; resolver already logs */
    });
  }, opts.debounceMs);

  for (const rel of RELATIVE_GLOBS) {
    const pattern = new vscode.RelativePattern(opts.laravelRoot, rel);
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    watcher.onDidChange(() => trigger(), undefined, disposables);
    watcher.onDidCreate(() => trigger(), undefined, disposables);
    watcher.onDidDelete(() => trigger(), undefined, disposables);
    disposables.push(watcher);
  }

  return {
    dispose(): void {
      trigger.cancel();
      for (const d of disposables) {
        d.dispose();
      }
    }
  };
}

export function describeWatchedPaths(laravelRoot: string): string[] {
  return RELATIVE_GLOBS.map(g => path.posix.join(laravelRoot.replace(/\\/g, '/'), g));
}
