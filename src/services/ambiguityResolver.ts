import * as path from 'node:path';
import { LaravelRoute, ResolvedLocation } from '../models/route';
import { ScoredRoute } from './routeMatcher';
import { AmbiguityScope } from '../utils/config';

export interface CandidateRoute {
  readonly route: LaravelRoute;
  readonly score: number;
  readonly location?: ResolvedLocation;
}

export interface QuickPickEntry {
  readonly label: string;
  readonly description?: string;
  readonly detail?: string;
}

/**
 * Restricts the set of candidate routes presented to the user, depending on
 * the configured scope.
 *
 * - `topScoreOnly`: keep only the routes tied for the highest specificity
 *   score. Less-specific fallbacks (e.g. catch-all `{any}` patterns) are
 *   hidden when at least one more specific match exists.
 * - `allMatches`: keep every match (already sorted by descending score).
 */
export function filterCandidatesByScope(
  scored: ReadonlyArray<ScoredRoute>,
  scope: AmbiguityScope
): ScoredRoute[] {
  if (scored.length === 0) {
    return [];
  }
  if (scope === 'allMatches') {
    return [...scored];
  }
  const topScore = scored[0].score;
  return scored.filter(scoredRoute => scoredRoute.score === topScore);
}

/**
 * Builds the QuickPick label/description/detail for a given candidate. The
 * label always shows the full Laravel route URI so the user can disambiguate
 * even when multiple routes hit the same controller class.
 */
export function formatQuickPickEntry(
  candidate: CandidateRoute,
  laravelRoot: string
): QuickPickEntry {
  const methods = candidate.route.methods.length > 0
    ? candidate.route.methods.join('|')
    : 'ANY';
  const label = `${methods} ${candidate.route.uri}`;
  const description = candidate.route.action || candidate.route.controller || undefined;
  const detail = candidate.location
    ? toWorkspaceRelative(candidate.location.file, laravelRoot)
    : undefined;
  return { label, description, detail };
}

function toWorkspaceRelative(filePath: string, root: string): string {
  if (!root) {
    return filePath;
  }
  const relativePath = path.relative(root, filePath);
  if (!relativePath || relativePath.startsWith('..')) {
    return filePath;
  }
  return relativePath;
}
