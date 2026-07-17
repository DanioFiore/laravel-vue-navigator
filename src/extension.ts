import * as vscode from 'vscode';
import { effectiveApiBaseUrl, getConfig, onConfigChange } from './utils/config';
import { detectPaths, getWorkspaceRoot } from './utils/workspaceDetector';
import { log, logError } from './utils/logger';
import { AxiosDefinitionProvider } from './providers/axiosDefinitionProvider';
import { AxiosDocumentLinkProvider } from './providers/axiosDocumentLinkProvider';
import { RouteResolver, RouteResolverOptions } from './services/routeResolver';
import { clearComposerCache, locateController } from './services/controllerLocator';
import { extractEndpointAt } from './services/axiosParser/urlExtractor';
import { matchRoute } from './services/routeMatcher';
import {
  NavigationDependencies,
  navigateAtPosition,
  openResolvedLocation
} from './services/navigationService';
import { GoToControllerArgs } from './providers/axiosDocumentLinkProvider';

const DOCUMENT_SELECTORS: vscode.DocumentFilter[] = [
  { scheme: 'file', language: 'vue' },
  { scheme: 'file', pattern: '**/*.vue' },
  { scheme: 'file', language: 'typescript' },
  { scheme: 'file', language: 'javascript' },
  { scheme: 'file', language: 'typescriptreact' },
  { scheme: 'file', language: 'javascriptreact' }
];

let resolver: RouteResolver | undefined;
let laravelRoot: string | undefined;

function getNavigationDeps(): NavigationDependencies | undefined {
  if (!resolver || !laravelRoot) {
    return undefined;
  }
  return { resolver, laravelRoot, getConfig };
}

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
    void vscode.window.showWarningMessage(
      'Laravel-Vue Navigator: no Laravel project found (missing artisan). Set laravelVueNavigator.laravelPath in settings.'
    );
    return;
  }

  laravelRoot = detected.laravelRoot;
  log(`Using Laravel root: ${detected.laravelRoot}`);
  if (detected.frontendRoot) {
    log(`Detected frontend root: ${detected.frontendRoot}`);
  }

  resolver = new RouteResolver(buildResolverOptions(workspaceRoot, detected.laravelRoot, config));
  resolver.start();
  context.subscriptions.push(resolver);

  resolver
    .refresh(true)
    .catch(error => logError('Initial route refresh failed', error));

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      DOCUMENT_SELECTORS,
      new AxiosDefinitionProvider(getNavigationDeps)
    )
  );
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(DOCUMENT_SELECTORS, new AxiosDocumentLinkProvider())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('laravelVueNavigator.goToController', async (args?: GoToControllerArgs) => {
      await runGoToController(args);
    })
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
      } catch (error) {
        logError('Manual refresh failed', error);
        vscode.window.showErrorMessage('Laravel-Vue Navigator: route refresh failed. Check the output channel.');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('laravelVueNavigator.showRouteForEndpoint', async () => {
      const editor = vscode.window.activeTextEditor;
      const root = laravelRoot;
      if (!editor || !resolver || !root) {
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
      const config = getConfig();
      const route = matchRoute(endpoint, routes, {
        apiBaseUrl: effectiveApiBaseUrl(config.apiBaseUrl, root)
      });
      if (!route) {
        vscode.window.showWarningMessage(
          `Laravel-Vue Navigator: no Laravel route matched '${endpoint.pattern}'${endpoint.verb ? ' (' + endpoint.verb + ')' : ''}.`
        );
        return;
      }
      const target = locateController(route, { laravelRoot: root });
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
      if (!resolver || !workspaceRoot) {
        return;
      }
      const next = getConfig();
      const paths = detectPaths(next.laravelPath, next.frontendPath);
      if (!paths.laravelRoot) {
        return;
      }
      laravelRoot = paths.laravelRoot;
      clearComposerCache();
      resolver.updateOptions(buildResolverOptions(workspaceRoot, paths.laravelRoot, next));
      resolver.refresh(true).catch(error => logError('Refresh after config change failed', error));
    })
  );
}

export function deactivate(): void {
  resolver?.dispose();
  resolver = undefined;
  laravelRoot = undefined;
}

async function runGoToController(args?: GoToControllerArgs): Promise<void> {
  const deps = getNavigationDeps();
  if (!deps) {
    return;
  }

  let document: vscode.TextDocument | undefined;
  let position: vscode.Position | undefined;

  if (args?.uri) {
    try {
      document = await vscode.workspace.openTextDocument(vscode.Uri.parse(args.uri));
      position = new vscode.Position(args.line, args.character);
    } catch (error) {
      logError('goToController: could not open document', error);
      return;
    }
  } else {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    document = editor.document;
    position = editor.selection.active;
  }

  const outcome = await navigateAtPosition(
    deps,
    document,
    position,
    new vscode.CancellationTokenSource().token,
    { logFailures: true }
  );

  if (outcome.type === 'location') {
    await openResolvedLocation(outcome.location);
    return;
  }

  if (outcome.type === 'failure') {
    const messages: Record<string, string> = {
      no_endpoint: 'Place the cursor on the axios URL string (not on axios/api), then try again.',
      no_routes: outcome.detail ?? 'No Laravel routes are loaded. Check the LVN status bar item and refresh routes.',
      no_match: outcome.detail ?? 'No matching Laravel route was found.',
      no_controller: 'Matched a route but could not resolve the controller PHP file.',
      cancelled: ''
    };
    const message = messages[outcome.reason];
    if (message) {
      void vscode.window.showWarningMessage(`Laravel-Vue Navigator: ${message}`);
    }
  }
}

function buildResolverOptions(
  workspaceRoot: string,
  root: string,
  config: ReturnType<typeof getConfig>
): RouteResolverOptions {
  return {
    workspaceRoot,
    laravelRoot: root,
    phpBinary: config.phpBinary,
    useArtisan: config.useArtisan,
    cacheTtlSeconds: config.routeCacheTtlSeconds,
    debounceMs: config.refreshDebounceMs
  };
}
