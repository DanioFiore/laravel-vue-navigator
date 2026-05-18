import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CandidateRoute,
  filterCandidatesByScope,
  formatQuickPickEntry
} from '../../services/ambiguityResolver';
import { LaravelRoute } from '../../models/route';
import { ScoredRoute } from '../../services/routeMatcher';

function buildScored(uri: string, score: number, methods: LaravelRoute['methods'] = ['GET']): ScoredRoute {
  return {
    score,
    route: {
      methods,
      uri,
      action: `App\\Http\\Controllers\\X@y`,
      controller: 'App\\Http\\Controllers\\X',
      controllerMethod: 'y'
    }
  };
}

describe('filterCandidatesByScope', () => {
  it('returns an empty array for empty input regardless of scope', () => {
    expect(filterCandidatesByScope([], 'topScoreOnly')).toEqual([]);
    expect(filterCandidatesByScope([], 'allMatches')).toEqual([]);
  });

  it('keeps only the top-score group when scope=topScoreOnly', () => {
    const scored: ScoredRoute[] = [
      buildScored('/api/template/users', 6),
      buildScored('/api/route_book/users', 6),
      buildScored('/api/{any}/users', 4)
    ];
    const filtered = filterCandidatesByScope(scored, 'topScoreOnly');
    expect(filtered.map(s => s.route.uri)).toEqual([
      '/api/template/users',
      '/api/route_book/users'
    ]);
  });

  it('keeps every match when scope=allMatches', () => {
    const scored: ScoredRoute[] = [
      buildScored('/api/template/users', 6),
      buildScored('/api/{any}/users', 4)
    ];
    const filtered = filterCandidatesByScope(scored, 'allMatches');
    expect(filtered).toHaveLength(2);
    expect(filtered[0].score).toBeGreaterThan(filtered[1].score);
  });

  it('returns a single-item array unchanged when only one route matched', () => {
    const scored: ScoredRoute[] = [buildScored('/api/users', 4)];
    expect(filterCandidatesByScope(scored, 'topScoreOnly')).toEqual(scored);
    expect(filterCandidatesByScope(scored, 'allMatches')).toEqual(scored);
  });
});

describe('formatQuickPickEntry', () => {
  const LARAVEL_ROOT = '/repo/backend';

  function buildCandidate(overrides: Partial<LaravelRoute> = {}): CandidateRoute {
    const route: LaravelRoute = {
      methods: ['GET'],
      uri: '/api/template/users',
      action: 'App\\Http\\Controllers\\Template\\UserController@index',
      controller: 'App\\Http\\Controllers\\Template\\UserController',
      controllerMethod: 'index',
      ...overrides
    };
    return {
      route,
      score: 6,
      location: {
        file: path.join(LARAVEL_ROOT, 'app/Http/Controllers/Template/UserController.php'),
        line: 12,
        column: 4
      }
    };
  }

  it('builds a label with HTTP verbs and the full URI', () => {
    const entry = formatQuickPickEntry(buildCandidate(), LARAVEL_ROOT);
    expect(entry.label).toBe('GET /api/template/users');
  });

  it('joins multiple methods with a pipe', () => {
    const entry = formatQuickPickEntry(
      buildCandidate({ methods: ['GET', 'POST'] }),
      LARAVEL_ROOT
    );
    expect(entry.label).toBe('GET|POST /api/template/users');
  });

  it("falls back to 'ANY' when no methods are declared", () => {
    const entry = formatQuickPickEntry(
      buildCandidate({ methods: [] }),
      LARAVEL_ROOT
    );
    expect(entry.label).toBe('ANY /api/template/users');
  });

  it('uses the action as description when available', () => {
    const entry = formatQuickPickEntry(buildCandidate(), LARAVEL_ROOT);
    expect(entry.description).toBe('App\\Http\\Controllers\\Template\\UserController@index');
  });

  it('returns a path relative to the Laravel root for detail', () => {
    const entry = formatQuickPickEntry(buildCandidate(), LARAVEL_ROOT);
    expect(entry.detail).toBe(path.join('app', 'Http', 'Controllers', 'Template', 'UserController.php'));
  });

  it('keeps an absolute detail path when the file lives outside the Laravel root', () => {
    const candidate: CandidateRoute = {
      ...buildCandidate(),
      location: {
        file: '/elsewhere/Foo.php',
        line: 0,
        column: 0
      }
    };
    const entry = formatQuickPickEntry(candidate, LARAVEL_ROOT);
    expect(entry.detail).toBe('/elsewhere/Foo.php');
  });
});
