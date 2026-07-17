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

export function createRouteWatcher(options: RouteWatcherOptions): vscode.Disposable {
  const disposables: vscode.Disposable[] = [];
  const trigger = debounce(() => {
    Promise.resolve(options.onRefresh()).catch(() => {
      /* swallow; resolver already logs */
    });
  }, options.debounceMs);

  for (const relativeGlob of RELATIVE_GLOBS) {
    const pattern = new vscode.RelativePattern(options.laravelRoot, relativeGlob);
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    watcher.onDidChange(() => trigger(), undefined, disposables);
    watcher.onDidCreate(() => trigger(), undefined, disposables);
    watcher.onDidDelete(() => trigger(), undefined, disposables);
    disposables.push(watcher);
  }

  return {
    dispose(): void {
      trigger.cancel();
      for (const disposable of disposables) {
        disposable.dispose();
      }
    }
  };
}

export function describeWatchedPaths(laravelRoot: string): string[] {
  return RELATIVE_GLOBS.map(glob => path.posix.join(laravelRoot.replace(/\\/g, '/'), glob));
}
