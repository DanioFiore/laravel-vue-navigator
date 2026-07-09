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
  opts: MatchOptions
): LaravelRoute | undefined {
  const all = matchRoutes(endpoint, routes, opts);
  return all[0]?.route;
}

/**
 * Returns every route that matches the extracted endpoint, sorted by
 * descending specificity score. Multiple entries with the same top score
 * indicate a genuine ambiguity that callers may want to surface to the user.
 */
export function matchRoutes(
  endpoint: ExtractedEndpoint,
  routes: LaravelRoute[],
  opts: MatchOptions
): ScoredRoute[] {
  const candidates = candidatePatterns(endpoint.pattern, opts.apiBaseUrl);
  const verb = endpoint.verb;

  const verbResults = collectMatches(routes, candidates, verb, opts.apiBaseUrl);
  if (verbResults.length > 0) {
    return verbResults;
  }
  if (verb) {
    return collectMatches(routes, candidates, undefined, opts.apiBaseUrl);
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
  for (const cand of candidates) {
    for (const r of routes) {
      if (verb && !routeAcceptsVerb(r, verb)) {
        continue;
      }
      const routePatterns = routeUriPatterns(r.uri, apiBaseUrl);
      const matched = routePatterns.some(routePattern => patternsMatch(cand, routePattern));
      if (!matched) {
        continue;
      }
      // Score by the route's own canonical URI, never by a prefixed/stripped
      // matching variant. Using a variant's score would inflate the specificity
      // of loosely-matched routes (e.g. a web `/profile` matched via its synthetic
      // `/api/profile` variant), producing false ties and spurious ambiguity.
      const score = scoreSpecificity(normalizePattern(r.uri));
      const existing = found.get(r);
      if (existing === undefined || score > existing) {
        found.set(r, score);
      }
    }
  }
  return Array.from(found, ([route, score]) => ({ route, score })).sort(
    (a, b) => b.score - a.score
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
  let s = raw.trim();
  const queryIdx = s.indexOf('?');
  if (queryIdx !== -1) {
    s = s.slice(0, queryIdx);
  }
  if (s !== '/' && s.endsWith('/')) {
    s = s.slice(0, -1);
  }
  if (!s.startsWith('/')) {
    s = '/' + s;
  }
  const parts = s === '/' ? [''] : s.slice(1).split('/');
  const segments: PatternSegment[] = parts.map(p => {
    if (/^\{[^}]+\}$/.test(p) || p === '{param}') {
      return { type: 'param' as const };
    }
    return { type: 'literal' as const, value: p };
  });
  return { segments };
}

function patternsMatch(client: NormalizedPattern, route: NormalizedPattern): boolean {
  const c = client.segments;
  const r = route.segments;
  let routeMinLen = 0;
  let routeMaxLen = 0;
  for (const seg of r) {
    routeMaxLen++;
    if (seg.type === 'literal' || !isOptionalParam(seg)) {
      routeMinLen++;
    }
  }
  if (c.length < routeMinLen || c.length > routeMaxLen) {
    return false;
  }
  for (let i = 0; i < c.length; i++) {
    const cs = c[i];
    const rs = r[i];
    if (!rs) {
      return false;
    }
    if (rs.type === 'param') {
      continue;
    }
    if (cs.type === 'param') {
      continue;
    }
    if (cs.value !== rs.value) {
      return false;
    }
  }
  return true;
}

function isOptionalParam(_seg: PatternSegment): boolean {
  return false;
}

function scoreSpecificity(p: NormalizedPattern): number {
  let score = 0;
  for (const seg of p.segments) {
    if (seg.type === 'literal') {
      score += 2;
    } else {
      score += 1;
    }
  }
  return score;
}
