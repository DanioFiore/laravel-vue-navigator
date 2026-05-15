import * as vscode from 'vscode';
import { getConfig, onConfigChange } from './utils/config';
import { detectPaths, getWorkspaceRoot } from './utils/workspaceDetector';
import { log, logError } from './utils/logger';
import { AxiosDefinitionProvider } from './providers/axiosDefinitionProvider';
import { RouteResolver, RouteResolverOptions } from './services/routeResolver';
import { clearComposerCache, locateController } from './services/controllerLocator';
import { extractEndpointAt } from './services/axiosParser/urlExtractor';
import { matchRoute } from './services/routeMatcher';

const SUPPORTED_LANGUAGES = [
  { scheme: 'file', language: 'vue' },
  { scheme: 'file', language: 'typescript' },
  { scheme: 'file', language: 'javascript' },
  { scheme: 'file', language: 'typescriptreact' },
  { scheme: 'file', language: 'javascriptreact' }
];

let resolver: RouteResolver | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    log('No workspace folder open, extension idle.');
    return;
  }

  const config = getConfig();
  const detected = detectPaths(config.laravelPath, config.frontendPath);
  if (!detected.laravelRoot) {
    log('Could not locate Laravel root (no artisan file found). Set laravelVueNavigator.laravelPath to enable.');
    return;
  }
  log(`Using Laravel root: ${detected.laravelRoot}`);
  if (detected.frontendRoot) {
    log(`Detected frontend root: ${detected.frontendRoot}`);
  }

  resolver = new RouteResolver(buildResolverOptions(workspaceRoot, detected.laravelRoot, config));
  resolver.start();
  context.subscriptions.push(resolver);

  resolver
    .refresh(true)
    .catch(err => logError('Initial route refresh failed', err));

  const provider = new AxiosDefinitionProvider({
    resolver,
    laravelRoot: detected.laravelRoot,
    getConfig
  });
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(SUPPORTED_LANGUAGES, provider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('laravelVueNavigator.refreshRoutes', async () => {
      if (!resolver) {
        return;
      }
      clearComposerCache();
      try {
        const state = await resolver.refresh(true);
        vscode.window.setStatusBarMessage(
          `Laravel-Vue Navigator: refreshed ${state.routes.length} routes (${state.source}).`,
          3000
        );
      } catch (err) {
        logError('Manual refresh failed', err);
        vscode.window.showErrorMessage('Laravel-Vue Navigator: route refresh failed. Check the output channel.');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('laravelVueNavigator.showRouteForEndpoint', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !resolver) {
        return;
      }
      const endpoint = extractEndpointAt({
        languageId: editor.document.languageId,
        source: editor.document.getText(),
        line: editor.selection.active.line,
        character: editor.selection.active.character
      });
      if (!endpoint) {
        vscode.window.showInformationMessage('Laravel-Vue Navigator: no axios endpoint detected at the cursor.');
        return;
      }
      const routes = await resolver.getRoutes();
      const cfg = getConfig();
      const route = matchRoute(endpoint, routes, { apiBaseUrl: cfg.apiBaseUrl });
      if (!route) {
        vscode.window.showWarningMessage(
          `Laravel-Vue Navigator: no Laravel route matched '${endpoint.pattern}'${endpoint.verb ? ' (' + endpoint.verb + ')' : ''}.`
        );
        return;
      }
      const target = locateController(route, { laravelRoot: detected.laravelRoot! });
      const action = `${route.methods.join('|')} ${route.uri} -> ${route.action}`;
      if (!target) {
        vscode.window.showInformationMessage(`Laravel-Vue Navigator: ${action} (file not resolved).`);
        return;
      }
      vscode.window.showInformationMessage(`Laravel-Vue Navigator: ${action}`);
    })
  );

  context.subscriptions.push(
    onConfigChange(() => {
      if (!resolver) {
        return;
      }
      const next = getConfig();
      const paths = detectPaths(next.laravelPath, next.frontendPath);
      if (!paths.laravelRoot) {
        return;
      }
      clearComposerCache();
      resolver.updateOptions(buildResolverOptions(workspaceRoot, paths.laravelRoot, next));
      resolver.refresh(true).catch(err => logError('Refresh after config change failed', err));
    })
  );
}

export function deactivate(): void {
  resolver?.dispose();
  resolver = undefined;
}

function buildResolverOptions(
  workspaceRoot: string,
  laravelRoot: string,
  config: ReturnType<typeof getConfig>
): RouteResolverOptions {
  return {
    workspaceRoot,
    laravelRoot,
    phpBinary: config.phpBinary,
    useArtisan: config.useArtisan,
    cacheTtlSeconds: config.routeCacheTtlSeconds,
    debounceMs: config.refreshDebounceMs
  };
}
