import * as vscode from 'vscode';
import { effectiveApiBaseUrl, ExtensionConfig } from '../utils/config';
import { extractEndpointAt } from './axiosParser/urlExtractor';
import { matchRoutes, ScoredRoute } from './routeMatcher';
import { locateController } from './controllerLocator';
import { RouteResolver } from './routeResolver';
import {
  CandidateRoute,
  filterCandidatesByScope,
  formatQuickPickEntry
} from './ambiguityResolver';
import { ResolvedLocation } from '../models/route';
import { log, logError } from '../utils/logger';

export interface NavigationDependencies {
  readonly resolver: RouteResolver;
  readonly laravelRoot: string;
  readonly getConfig: () => ExtensionConfig;
}

export type NavigationFailureReason =
  | 'no_endpoint'
  | 'no_routes'
  | 'no_match'
  | 'no_controller'
  | 'cancelled';

export interface NavigationSuccess {
  readonly type: 'location';
  readonly location: ResolvedLocation;
}

export interface NavigationFailure {
  readonly type: 'failure';
  readonly reason: NavigationFailureReason;
  readonly detail?: string;
}

export type NavigationOutcome = NavigationSuccess | NavigationFailure;

interface ResolvedCandidate extends CandidateRoute {
  readonly location: ResolvedLocation;
}

interface CandidateQuickPickItem extends vscode.QuickPickItem {
  readonly candidate: ResolvedCandidate;
}

export async function navigateAtPosition(
  deps: NavigationDependencies,
  document: vscode.TextDocument,
  position: vscode.Position,
  token: vscode.CancellationToken,
  options?: { logFailures?: boolean }
): Promise<NavigationOutcome> {
  const logFailures = options?.logFailures ?? false;
  const file = document.fileName;

  const endpoint = extractEndpointAt({
    languageId: document.languageId,
    source: document.getText(),
    line: position.line,
    character: position.character
  });

  if (!endpoint) {
    if (logFailures) {
      log(`No axios endpoint at ${file}:${position.line + 1}:${position.character + 1} (click the URL string, not axios/api)`);
    }
    return { type: 'failure', reason: 'no_endpoint' };
  }

  if (token.isCancellationRequested) {
    return { type: 'failure', reason: 'cancelled' };
  }

  const routes = await deps.resolver.getRoutes();
  if (token.isCancellationRequested) {
    return { type: 'failure', reason: 'cancelled' };
  }
  if (routes.length === 0) {
    const detail = 'Route cache is empty. Check the status bar (LVN) and output channel; set laravelVueNavigator.phpBinary or run Refresh routes.';
    if (logFailures) {
      log(`No routes loaded while navigating '${endpoint.pattern}' in ${file}`);
    }
    return { type: 'failure', reason: 'no_routes', detail };
  }

  const config = deps.getConfig();
  const scored = matchRoutes(endpoint, routes, {
    apiBaseUrl: effectiveApiBaseUrl(config.apiBaseUrl, deps.laravelRoot)
  });

  if (scored.length === 0) {
    const detail = `No Laravel route matched '${endpoint.pattern}'${endpoint.verb ? ` (${endpoint.verb})` : ''}.`;
    if (logFailures) {
      log(`${detail} File: ${file}`);
    }
    return { type: 'failure', reason: 'no_match', detail };
  }

  const location = await resolveScoredRoutes(deps, scored, endpoint, config, token);
  if (!location) {
    if (logFailures) {
      log(`Could not resolve controller for '${endpoint.pattern}' in ${file}`);
    }
    return { type: 'failure', reason: 'no_controller' };
  }

  return { type: 'location', location };
}

export async function openResolvedLocation(location: ResolvedLocation): Promise<void> {
  const uri = vscode.Uri.file(location.file);
  const position = new vscode.Position(location.line, location.column);
  const selection = new vscode.Range(position, position);
  try {
    await vscode.window.showTextDocument(uri, { selection });
  } catch (error) {
    logError(`Failed to open controller at ${location.file}:${location.line}`, error);
  }
}

export function toVsCodeLocation(location: ResolvedLocation): vscode.Location {
  return new vscode.Location(
    vscode.Uri.file(location.file),
    new vscode.Position(location.line, location.column)
  );
}

export function toLocationLink(candidate: ResolvedCandidate): vscode.LocationLink {
  const range = new vscode.Range(
    new vscode.Position(candidate.location.line, candidate.location.column),
    new vscode.Position(candidate.location.line, candidate.location.column)
  );
  return {
    targetUri: vscode.Uri.file(candidate.location.file),
    targetRange: range,
    targetSelectionRange: range
  };
}

export async function provideDefinitionAt(
  deps: NavigationDependencies,
  document: vscode.TextDocument,
  position: vscode.Position,
  token: vscode.CancellationToken
): Promise<vscode.Location | vscode.LocationLink[] | undefined> {
  const endpoint = extractEndpointAt({
    languageId: document.languageId,
    source: document.getText(),
    line: position.line,
    character: position.character
  });
  if (!endpoint || token.isCancellationRequested) {
    return undefined;
  }

  const routes = await deps.resolver.getRoutes();
  if (token.isCancellationRequested || routes.length === 0) {
    if (routes.length === 0) {
      log(`Definition skipped: no routes loaded (${document.fileName})`);
    }
    return undefined;
  }

  const config = deps.getConfig();
  const scored = matchRoutes(endpoint, routes, {
    apiBaseUrl: effectiveApiBaseUrl(config.apiBaseUrl, deps.laravelRoot)
  });
  if (scored.length === 0) {
    return undefined;
  }

  if (scored.length === 1) {
    const location = locationForRoute(scored[0], deps.laravelRoot);
    return location ? toVsCodeLocation(location) : undefined;
  }

  const filtered = filterCandidatesByScope(scored, config.ambiguityScope);
  if (filtered.length <= 1) {
    const location = filtered[0] ? locationForRoute(filtered[0], deps.laravelRoot) : undefined;
    return location ? toVsCodeLocation(location) : undefined;
  }

  const candidates = resolveCandidates(filtered, deps.laravelRoot);
  if (candidates.length === 0) {
    return undefined;
  }
  if (candidates.length === 1) {
    return toVsCodeLocation(candidates[0].location);
  }
  if (token.isCancellationRequested) {
    return undefined;
  }

  log(
    `Ambiguous endpoint '${endpoint.pattern}' (${endpoint.verb ?? 'any verb'}): ${candidates.length} candidate routes -> strategy=${config.ambiguityStrategy}`
  );

  switch (config.ambiguityStrategy) {
    case 'first':
      return toVsCodeLocation(candidates[0].location);
    case 'peek':
      return candidates.map(toLocationLink);
    case 'pick':
    default: {
      const picked = await promptUserToPick(candidates, deps.laravelRoot, token);
      if (!picked) {
        return undefined;
      }
      await openResolvedLocation(picked);
      return undefined;
    }
  }
}

async function resolveScoredRoutes(
  deps: NavigationDependencies,
  scored: ScoredRoute[],
  endpoint: { pattern: string; verb?: string },
  config: ExtensionConfig,
  token: vscode.CancellationToken
): Promise<ResolvedLocation | undefined> {
  if (scored.length === 1) {
    return locationForRoute(scored[0], deps.laravelRoot);
  }

  const filtered = filterCandidatesByScope(scored, config.ambiguityScope);
  if (filtered.length <= 1) {
    return filtered[0] ? locationForRoute(filtered[0], deps.laravelRoot) : undefined;
  }

  const candidates = resolveCandidates(filtered, deps.laravelRoot);
  if (candidates.length === 0) {
    return undefined;
  }
  if (candidates.length === 1) {
    return candidates[0].location;
  }
  if (token.isCancellationRequested) {
    return undefined;
  }

  log(
    `Ambiguous endpoint '${endpoint.pattern}' (${endpoint.verb ?? 'any verb'}): ${candidates.length} candidate routes -> strategy=${config.ambiguityStrategy}`
  );

  switch (config.ambiguityStrategy) {
    case 'first':
      return candidates[0].location;
    case 'peek':
      return candidates[0].location;
    case 'pick':
    default:
      return promptUserToPick(candidates, deps.laravelRoot, token);
  }
}

function locationForRoute(scored: ScoredRoute, laravelRoot: string): ResolvedLocation | undefined {
  if (!scored.route.controller) {
    return undefined;
  }
  return locateController(scored.route, { laravelRoot });
}

function resolveCandidates(scored: ReadonlyArray<ScoredRoute>, laravelRoot: string): ResolvedCandidate[] {
  const candidates: ResolvedCandidate[] = [];
  for (const scoredRoute of scored) {
    const location = locationForRoute(scoredRoute, laravelRoot);
    if (!location) {
      continue;
    }
    candidates.push({ route: scoredRoute.route, score: scoredRoute.score, location });
  }
  return candidates;
}

async function promptUserToPick(
  candidates: ReadonlyArray<ResolvedCandidate>,
  laravelRoot: string,
  token: vscode.CancellationToken
): Promise<ResolvedLocation | undefined> {
  const items: CandidateQuickPickItem[] = candidates.map(candidate => ({
    ...formatQuickPickEntry(candidate, laravelRoot),
    candidate
  }));

  const cancelSource = new vscode.CancellationTokenSource();
  const tokenSub = token.onCancellationRequested(() => cancelSource.cancel());

  let selected: CandidateQuickPickItem | undefined;
  try {
    selected = await vscode.window.showQuickPick(items, {
      placeHolder: `Multiple Laravel routes match this endpoint — pick one (${items.length})`,
      matchOnDescription: true,
      matchOnDetail: true,
      ignoreFocusOut: false,
      title: 'Laravel-Vue Navigator: choose a route'
    }, cancelSource.token);
  } finally {
    tokenSub.dispose();
    cancelSource.dispose();
  }

  if (!selected || token.isCancellationRequested) {
    return undefined;
  }
  return selected.candidate.location;
}
