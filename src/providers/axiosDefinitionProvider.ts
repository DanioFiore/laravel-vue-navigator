import * as vscode from 'vscode';
import { effectiveApiBaseUrl, ExtensionConfig } from '../utils/config';
import { extractEndpointAt } from '../services/axiosParser/urlExtractor';
import { matchRoutes, ScoredRoute } from '../services/routeMatcher';
import { locateController } from '../services/controllerLocator';
import { RouteResolver } from '../services/routeResolver';
import {
  CandidateRoute,
  filterCandidatesByScope,
  formatQuickPickEntry
} from '../services/ambiguityResolver';
import { ResolvedLocation } from '../models/route';
import { log, logError } from '../utils/logger';

export interface ProviderDependencies {
  readonly resolver: RouteResolver;
  readonly laravelRoot: string;
  readonly getConfig: () => ExtensionConfig;
}

type ResolvedCandidate = CandidateRoute & { readonly location: ResolvedLocation };

interface CandidateQuickPickItem extends vscode.QuickPickItem {
  readonly candidate: ResolvedCandidate;
}

export class AxiosDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private readonly deps: ProviderDependencies) {}

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.LocationLink[] | vscode.Location | undefined> {
    const endpoint = extractEndpointAt({
      languageId: document.languageId,
      source: document.getText(),
      line: position.line,
      character: position.character
    });

    if (!endpoint) {
      return undefined;
    }
    if (token.isCancellationRequested) {
      return undefined;
    }

    const routes = await this.deps.resolver.getRoutes();
    if (token.isCancellationRequested || routes.length === 0) {
      return undefined;
    }

    const config = this.deps.getConfig();
    const scored = matchRoutes(endpoint, routes, {
      apiBaseUrl: effectiveApiBaseUrl(config.apiBaseUrl, this.deps.laravelRoot)
    });
    if (scored.length === 0) {
      return undefined;
    }

    if (scored.length === 1) {
      return this.locationFor(scored[0]);
    }

    const filtered = filterCandidatesByScope(scored, config.ambiguityScope);
    if (filtered.length <= 1) {
      return filtered[0] ? this.locationFor(filtered[0]) : undefined;
    }

    const candidates = this.resolveCandidates(filtered);
    if (candidates.length === 0) {
      return undefined;
    }
    if (candidates.length === 1) {
      return toLocation(candidates[0].location);
    }
    if (token.isCancellationRequested) {
      return undefined;
    }

    log(
      `Ambiguous endpoint '${endpoint.pattern}' (${endpoint.verb ?? 'any verb'}): ${candidates.length} candidate routes -> strategy=${config.ambiguityStrategy}`
    );

    switch (config.ambiguityStrategy) {
      case 'first':
        return toLocation(candidates[0].location);
      case 'peek':
        return candidates.map(toLocationLink);
      case 'pick':
      default:
        return this.promptUserToPick(candidates, token);
    }
  }

  private locationFor(scored: ScoredRoute): vscode.Location | undefined {
    // A missing controllerMethod is valid for single-action (`__invoke`) controllers;
    // locateController defaults the method to `__invoke`. Only a missing controller
    // (e.g. Closure routes) is unresolvable.
    if (!scored.route.controller) {
      return undefined;
    }
    const location = locateController(scored.route, { laravelRoot: this.deps.laravelRoot });
    if (!location) {
      return undefined;
    }
    return toLocation(location);
  }

  private resolveCandidates(scored: ReadonlyArray<ScoredRoute>): ResolvedCandidate[] {
    const out: ResolvedCandidate[] = [];
    for (const s of scored) {
      const location = locateController(s.route, { laravelRoot: this.deps.laravelRoot });
      if (!location) {
        continue;
      }
      out.push({ route: s.route, score: s.score, location });
    }
    return out;
  }

  /**
   * Shows the disambiguation QuickPick and navigates imperatively to the
   * chosen controller.
   *
   * Returning a `vscode.Location` from `provideDefinition` after `await`ing a
   * QuickPick does NOT work: by the time the user picks an entry VS Code has
   * already considered the Go-to-Definition request abandoned (the popup
   * stole focus from the underlying request), so the returned Location is
   * silently discarded. We therefore open the target editor ourselves via
   * `window.showTextDocument` and always return `undefined` here so VS Code
   * does not attempt a second navigation.
   */
  private async promptUserToPick(
    candidates: ReadonlyArray<ResolvedCandidate>,
    token: vscode.CancellationToken
  ): Promise<undefined> {
    const items: CandidateQuickPickItem[] = candidates.map(c => ({
      ...formatQuickPickEntry(c, this.deps.laravelRoot),
      candidate: c
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

    if (!selected) {
      return undefined;
    }
    if (token.isCancellationRequested) {
      return undefined;
    }

    await openLocation(selected.candidate.location);
    return undefined;
  }
}

async function openLocation(location: ResolvedLocation): Promise<void> {
  const uri = vscode.Uri.file(location.file);
  const position = new vscode.Position(location.line, location.column);
  const selection = new vscode.Range(position, position);
  try {
    await vscode.window.showTextDocument(uri, { selection });
  } catch (err) {
    logError(`Failed to open selected controller at ${location.file}:${location.line}`, err);
  }
}

function toLocation(location: ResolvedLocation): vscode.Location {
  return new vscode.Location(
    vscode.Uri.file(location.file),
    new vscode.Position(location.line, location.column)
  );
}

function toLocationLink(candidate: ResolvedCandidate): vscode.LocationLink {
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
