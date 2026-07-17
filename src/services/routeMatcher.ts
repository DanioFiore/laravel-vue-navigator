import { ExtractedEndpoint, HttpMethod, LaravelRoute } from '../models/route';

export interface MatchOptions {
  readonly apiBaseUrl: string;
}

export interface ScoredRoute {
  readonly route: LaravelRoute;
  readonly score: number;
}

interface NormalizedPattern {
  readonly segments: PatternSegment[];
}

type PatternSegment = { type: 'literal'; value: string } | { type: 'param' };

export function matchRoute(
  endpoint: ExtractedEndpoint,
  routes: LaravelRoute[],
  options: MatchOptions
): LaravelRoute | undefined {
  const scoredRoutes = matchRoutes(endpoint, routes, options);
  return scoredRoutes[0]?.route;
}

/**
 * Returns every route that matches the extracted endpoint, sorted by
 * descending specificity score. Multiple entries with the same top score
 * indicate a genuine ambiguity that callers may want to surface to the user.
 */
export function matchRoutes(
  endpoint: ExtractedEndpoint,
  routes: LaravelRoute[],
  options: MatchOptions
): ScoredRoute[] {
  const candidates = candidatePatterns(endpoint.pattern, options.apiBaseUrl);
  const verb = endpoint.verb;

  const verbResults = collectMatches(routes, candidates, verb, options.apiBaseUrl);
  if (verbResults.length > 0) {
    return verbResults;
  }
  if (verb) {
    return collectMatches(routes, candidates, undefined, options.apiBaseUrl);
  }
  return [];
}

function collectMatches(
  routes: LaravelRoute[],
  candidates: NormalizedPattern[],
  verb: HttpMethod | undefined,
  apiBaseUrl: string
): ScoredRoute[] {
  const found = new Map<LaravelRoute, number>();
  for (const candidate of candidates) {
    for (const route of routes) {
      if (verb && !routeAcceptsVerb(route, verb)) {
        continue;
      }
      const routePatterns = routeUriPatterns(route.uri, apiBaseUrl);
      let bestPairScore = -1;
      for (const routePattern of routePatterns) {
        if (!patternsMatch(candidate, routePattern)) {
          continue;
        }
        // Score the *alignment* between client pattern and this route variant.
        // Route-only specificity (literals on the Laravel side) is wrong for
        // template literals: `/api/catalog/{kind}/{id}/items` must beat
        // `/api/catalog/products/archive-batch/{id}` when the client URL is
        // `/api/catalog/${kind}/${id}/items`, even though the latter has more literals.
        // Prefer the canonical URI shape when variants tie on alignment.
        const pairScore =
          scoreMatchAlignment(candidate, routePattern) * 1000 +
          scoreSpecificity(normalizePattern(route.uri));
        if (pairScore > bestPairScore) {
          bestPairScore = pairScore;
        }
      }
      if (bestPairScore < 0) {
        continue;
      }
      const existing = found.get(route);
      if (existing === undefined || bestPairScore > existing) {
        found.set(route, bestPairScore);
      }
    }
  }
  return Array.from(found, ([route, score]) => ({ route, score })).sort(
    (left, right) => right.score - left.score
  );
}

/** URI variants for matching (handles Laravel bootstrap apiPrefix vs axios /api/... paths). */
function routeUriPatterns(uri: string, apiBaseUrl: string): NormalizedPattern[] {
  const variants = new Set<string>([uri]);
  if (apiBaseUrl) {
    const base = apiBaseUrl.replace(/\/+$/, '');
    const withSlash = base.startsWith('/') ? base : `/${base}`;
    const normalized = uri.startsWith('/') ? uri : `/${uri}`;
    if (!normalized.startsWith(`${withSlash}/`) && normalized !== withSlash) {
      variants.add(`${withSlash}${normalized}`);
    }
    if (normalized.startsWith(`${withSlash}/`) || normalized === withSlash) {
      variants.add(normalized.slice(withSlash.length) || '/');
    }
  }
  return Array.from(variants).map(normalizePattern);
}

function routeAcceptsVerb(route: LaravelRoute, verb: HttpMethod): boolean {
  if (route.methods.includes('ANY')) {
    return true;
  }
  return route.methods.includes(verb);
}

function candidatePatterns(input: string, apiBaseUrl: string): NormalizedPattern[] {
  const variants = new Set<string>();
  const trimmed = input.trim();
  variants.add(trimmed);

  if (apiBaseUrl) {
    const base = apiBaseUrl.replace(/\/+$/, '');
    if (trimmed.startsWith(base + '/') || trimmed === base) {
      const stripped = trimmed === base ? '/' : trimmed.slice(base.length) || '/';
      variants.add(stripped);
    } else if (trimmed.startsWith('/')) {
      variants.add(base + trimmed);
    } else {
      variants.add(base + '/' + trimmed);
    }
  }

  if (!trimmed.startsWith('/')) {
    variants.add('/' + trimmed);
  }

  return Array.from(variants).map(normalizePattern);
}

function normalizePattern(raw: string): NormalizedPattern {
  let normalized = raw.trim();
  const queryIndex = normalized.indexOf('?');
  if (queryIndex !== -1) {
    normalized = normalized.slice(0, queryIndex);
  }
  if (normalized !== '/' && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }
  const parts = normalized === '/' ? [''] : normalized.slice(1).split('/');
  const segments: PatternSegment[] = parts.map(part => {
    if (/^\{[^}]+\}$/.test(part) || part === '{param}') {
      return { type: 'param' as const };
    }
    return { type: 'literal' as const, value: part };
  });
  return { segments };
}

function patternsMatch(client: NormalizedPattern, route: NormalizedPattern): boolean {
  const clientSegments = client.segments;
  const routeSegments = route.segments;
  let routeMinLen = 0;
  let routeMaxLen = 0;
  for (const segment of routeSegments) {
    routeMaxLen++;
    if (segment.type === 'literal' || !isOptionalParam(segment)) {
      routeMinLen++;
    }
  }
  if (clientSegments.length < routeMinLen || clientSegments.length > routeMaxLen) {
    return false;
  }
  for (let index = 0; index < clientSegments.length; index++) {
    const clientSegment = clientSegments[index];
    const routeSegment = routeSegments[index];
    if (!routeSegment) {
      return false;
    }
    if (routeSegment.type === 'param') {
      continue;
    }
    if (clientSegment.type === 'param') {
      continue;
    }
    if (clientSegment.value !== routeSegment.value) {
      return false;
    }
  }
  return true;
}

function isOptionalParam(_segment: PatternSegment): boolean {
  return false;
}

function scoreSpecificity(pattern: NormalizedPattern): number {
  let score = 0;
  for (const segment of pattern.segments) {
    if (segment.type === 'literal') {
      score += 2;
    } else {
      score += 1;
    }
  }
  return score;
}

/**
 * How well a client URL pattern aligns with a Laravel route pattern.
 *
 * Weights favour structural similarity for editor-time template literals:
 * - literal↔literal (same value): strongest
 * - client `{param}` ↔ route literal: concrete candidate for an unresolved var
 * - client literal ↔ route `{param}`: normal REST binding
 * - param↔param: weakest (catch-alls must not outrank concrete siblings)
 */
function scoreMatchAlignment(client: NormalizedPattern, route: NormalizedPattern): number {
  const clientSegments = client.segments;
  const routeSegments = route.segments;
  let score = 0;
  for (let index = 0; index < clientSegments.length; index++) {
    const clientSegment = clientSegments[index];
    const routeSegment = routeSegments[index];
    if (!routeSegment) {
      break;
    }
    if (clientSegment.type === 'literal' && routeSegment.type === 'literal') {
      score += 100;
      continue;
    }
    if (clientSegment.type === 'param' && routeSegment.type === 'literal') {
      score += 10;
      continue;
    }
    if (clientSegment.type === 'literal' && routeSegment.type === 'param') {
      score += 5;
      continue;
    }
    // param ↔ param
    score += 1;
  }
  return score;
}
