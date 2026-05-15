import { ExtractedEndpoint, HttpMethod, LaravelRoute } from '../models/route';

export interface MatchOptions {
  readonly apiBaseUrl: string;
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
  const candidates = candidatePatterns(endpoint.pattern, opts.apiBaseUrl);
  const verb = endpoint.verb;

  for (const cand of candidates) {
    const result = findFirstMatching(routes, cand, verb);
    if (result) {
      return result;
    }
  }
  if (verb) {
    for (const cand of candidates) {
      const result = findFirstMatching(routes, cand, undefined);
      if (result) {
        return result;
      }
    }
  }
  return undefined;
}

function findFirstMatching(
  routes: LaravelRoute[],
  pattern: NormalizedPattern,
  verb: HttpMethod | undefined
): LaravelRoute | undefined {
  let best: { route: LaravelRoute; score: number } | undefined;
  for (const r of routes) {
    if (verb && !routeAcceptsVerb(r, verb)) {
      continue;
    }
    const routePattern = normalizePattern(r.uri);
    if (!patternsMatch(pattern, routePattern)) {
      continue;
    }
    const score = scoreSpecificity(routePattern);
    if (!best || score > best.score) {
      best = { route: r, score };
    }
  }
  return best?.route;
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
    if (trimmed.startsWith(apiBaseUrl + '/') || trimmed === apiBaseUrl) {
      // already prefixed
    } else if (trimmed.startsWith('/')) {
      variants.add(apiBaseUrl + trimmed);
    } else {
      variants.add(apiBaseUrl + '/' + trimmed);
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
