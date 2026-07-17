import * as vscode from 'vscode';
import { LaravelRoute, RouteCachePayload } from '../../models/route';
import { log, logError } from '../../utils/logger';
import { ArtisanError, fetchRoutesViaArtisan } from './artisanProvider';
import { RouteCache } from './routeCache';
import { createRouteWatcher } from './routeWatcher';
import { detectApiRoutePrefix } from '../../utils/apiPrefixDetector';
import { parseRoutesFromFiles } from './staticParser';

export interface RouteResolverOptions {
  readonly workspaceRoot: string;
  readonly laravelRoot: string;
  readonly phpBinary: string;
  readonly useArtisan: boolean;
  readonly cacheTtlSeconds: number;
  readonly debounceMs: number;
}

export interface RouteResolverState {
  readonly routes: LaravelRoute[];
  readonly source: 'artisan' | 'static' | 'stale';
  readonly generatedAt: number;
}

export class RouteResolver implements vscode.Disposable {
  private readonly cache: RouteCache;
  private options: RouteResolverOptions;
  private watcher: vscode.Disposable | undefined;
  private inFlight: Promise<RouteResolverState> | undefined;
  private statusItem: vscode.StatusBarItem;
  private artisanUnavailableWarned = false;

  constructor(options: RouteResolverOptions) {
    this.options = options;
    this.cache = new RouteCache(options.workspaceRoot);
    this.statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
    this.statusItem.command = 'laravelVueNavigator.refreshRoutes';
  }

  start(): void {
    this.watcher?.dispose();
    this.watcher = createRouteWatcher({
      laravelRoot: this.options.laravelRoot,
      debounceMs: this.options.debounceMs,
      onRefresh: async () => {
        await this.refresh(true);
      }
    });
    this.setStatus('idle');
  }

  updateOptions(options: RouteResolverOptions): void {
    this.options = options;
    this.start();
  }

  async getRoutes(): Promise<LaravelRoute[]> {
    const cached = this.cache.read({ ttlSeconds: this.options.cacheTtlSeconds });
    if (cached) {
      return cached.routes;
    }
    const state = await this.refresh(false);
    return state.routes;
  }

  async refresh(force: boolean): Promise<RouteResolverState> {
    if (this.inFlight && !force) {
      return this.inFlight;
    }
    this.inFlight = this.doRefresh().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async doRefresh(): Promise<RouteResolverState> {
    this.setStatus('refreshing');

    if (this.options.useArtisan) {
      try {
        const routes = await fetchRoutesViaArtisan({
          phpBinary: this.options.phpBinary,
          laravelRoot: this.options.laravelRoot
        });
        const payload = this.cache.write(routes, 'artisan');
        this.setStatus('ok', payload);
        return { routes, source: 'artisan', generatedAt: payload.generatedAt };
      } catch (error) {
        const isArtisanError = error instanceof ArtisanError;
        const isMissingPhp = isArtisanError && /Failed to spawn/i.test((error as ArtisanError).message);
        logError('artisan route:list failed, attempting static parser fallback', error);
        if (isMissingPhp && !this.artisanUnavailableWarned) {
          this.artisanUnavailableWarned = true;
          vscode.window.showWarningMessage(
            "Laravel-Vue Navigator: 'php' binary not found, falling back to static parser. Configure 'laravelVueNavigator.phpBinary' to silence this."
          );
        }
        return this.fallbackToStaticOrStale(payload => this.setStatus('ok', payload));
      }
    }

    return this.fallbackToStaticOrStale(payload => this.setStatus('ok', payload));
  }

  private fallbackToStaticOrStale(
    onSuccess: (payload: RouteCachePayload) => void
  ): RouteResolverState {
    try {
      const routes = parseRoutesFromFiles({
        laravelRoot: this.options.laravelRoot,
        apiRoutePrefix: detectApiRoutePrefix(this.options.laravelRoot)
      });
      if (routes.length === 0) {
        return this.useStale();
      }
      const payload = this.cache.write(routes, 'static');
      onSuccess(payload);
      return { routes, source: 'static', generatedAt: payload.generatedAt };
    } catch (error) {
      logError('static parser also failed', error);
      return this.useStale();
    }
  }

  private useStale(): RouteResolverState {
    const stale = this.cache.getInMemory();
    if (stale) {
      this.setStatus('stale', stale);
      return { routes: stale.routes, source: 'stale', generatedAt: stale.generatedAt };
    }
    const fromDisk = this.cache.read({ ttlSeconds: 0 });
    if (fromDisk) {
      this.cache.setInMemory(fromDisk);
      this.setStatus('stale', fromDisk);
      return { routes: fromDisk.routes, source: 'stale', generatedAt: fromDisk.generatedAt };
    }
    this.setStatus('error');
    return { routes: [], source: 'stale', generatedAt: 0 };
  }

  private setStatus(state: 'idle' | 'refreshing' | 'ok' | 'stale' | 'error', payload?: RouteCachePayload): void {
    switch (state) {
      case 'idle':
        this.statusItem.text = '$(symbol-misc) LVN: ready';
        this.statusItem.tooltip = 'Laravel-Vue Navigator. Click to refresh routes.';
        this.statusItem.show();
        log('RouteResolver started, watcher active');
        break;
      case 'refreshing':
        this.statusItem.text = '$(sync~spin) LVN: refreshing';
        this.statusItem.show();
        break;
      case 'ok': {
        const count = payload?.routes.length ?? 0;
        const source = payload?.source ?? 'unknown';
        this.statusItem.text = `$(symbol-misc) LVN: ${count} routes (${source})`;
        this.statusItem.tooltip = `Laravel-Vue Navigator: ${count} routes loaded from ${source}. Click to refresh.`;
        this.statusItem.show();
        log(`Loaded ${count} routes from ${source}`);
        break;
      }
      case 'stale': {
        const count = payload?.routes.length ?? 0;
        this.statusItem.text = `$(warning) LVN: stale (${count})`;
        this.statusItem.tooltip = 'Route refresh failed, using stale cache. Click to retry.';
        this.statusItem.show();
        log(`Using stale cache (${count} routes)`);
        break;
      }
      case 'error':
        this.statusItem.text = '$(error) LVN: no routes';
        this.statusItem.tooltip = 'Could not load routes. Check the output channel.';
        this.statusItem.show();
        break;
    }
  }

  dispose(): void {
    this.watcher?.dispose();
    this.statusItem.dispose();
  }
}
