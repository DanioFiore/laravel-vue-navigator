import { describe, expect, it } from 'vitest';
import { LaravelRoute } from '../../models/route';
import { matchRoute, matchRoutes } from '../../services/routeMatcher';

const ROUTES: LaravelRoute[] = [
  {
    methods: ['GET'],
    uri: '/api/users',
    action: 'App\\Http\\Controllers\\UserController@index',
    controller: 'App\\Http\\Controllers\\UserController',
    controllerMethod: 'index'
  },
  {
    methods: ['GET'],
    uri: '/api/users/{user}',
    action: 'App\\Http\\Controllers\\UserController@show',
    controller: 'App\\Http\\Controllers\\UserController',
    controllerMethod: 'show'
  },
  {
    methods: ['POST'],
    uri: '/api/users/{user}/posts',
    action: 'App\\Http\\Controllers\\PostController@store',
    controller: 'App\\Http\\Controllers\\PostController',
    controllerMethod: 'store'
  },
  {
    methods: ['GET', 'POST'],
    uri: '/api/sessions',
    action: 'App\\Http\\Controllers\\SessionController@handle',
    controller: 'App\\Http\\Controllers\\SessionController',
    controllerMethod: 'handle'
  }
];

describe('matchRoute', () => {
  it('matches a literal route with verb', () => {
    const result = matchRoute({ pattern: '/api/users', verb: 'GET' }, ROUTES, { apiBaseUrl: '' });
    expect(result?.controllerMethod).toBe('index');
  });

  it('matches a route with a path parameter', () => {
    const result = matchRoute({ pattern: '/api/users/{param}', verb: 'GET' }, ROUTES, { apiBaseUrl: '' });
    expect(result?.controllerMethod).toBe('show');
  });

  it('matches a nested resource with verb=POST', () => {
    const result = matchRoute({ pattern: '/api/users/{param}/posts', verb: 'POST' }, ROUTES, { apiBaseUrl: '' });
    expect(result?.controllerMethod).toBe('store');
  });

  it('prefers literal segments over param segments', () => {
    const routes: LaravelRoute[] = [
      { methods: ['GET'], uri: '/api/{any}', action: 'A@a', controller: 'A', controllerMethod: 'a' },
      { methods: ['GET'], uri: '/api/health', action: 'B@b', controller: 'B', controllerMethod: 'b' }
    ];
    const result = matchRoute({ pattern: '/api/health', verb: 'GET' }, routes, { apiBaseUrl: '' });
    expect(result?.controllerMethod).toBe('b');
  });

  it('handles apiBaseUrl prepending for relative endpoints', () => {
    const result = matchRoute({ pattern: '/users', verb: 'GET' }, ROUTES, { apiBaseUrl: '/api' });
    expect(result?.controllerMethod).toBe('index');
  });

  it('matches multi-method route', () => {
    const result = matchRoute({ pattern: '/api/sessions', verb: 'POST' }, ROUTES, { apiBaseUrl: '' });
    expect(result?.controllerMethod).toBe('handle');
  });

  it('returns undefined when no route matches', () => {
    const result = matchRoute({ pattern: '/api/nope', verb: 'GET' }, ROUTES, { apiBaseUrl: '' });
    expect(result).toBeUndefined();
  });

  it('strips query string', () => {
    const result = matchRoute({ pattern: '/api/users?active=1', verb: 'GET' }, ROUTES, { apiBaseUrl: '' });
    expect(result?.controllerMethod).toBe('index');
  });
});

describe('matchRoutes', () => {
  const AMBIGUOUS_ROUTES: LaravelRoute[] = [
    {
      methods: ['GET'],
      uri: '/api/template/users',
      action: 'App\\Http\\Controllers\\Template\\UserController@index',
      controller: 'App\\Http\\Controllers\\Template\\UserController',
      controllerMethod: 'index'
    },
    {
      methods: ['GET'],
      uri: '/api/route_book/users',
      action: 'App\\Http\\Controllers\\RouteBook\\UserController@index',
      controller: 'App\\Http\\Controllers\\RouteBook\\UserController',
      controllerMethod: 'index'
    },
    {
      methods: ['GET'],
      uri: '/api/{any}/users',
      action: 'App\\Http\\Controllers\\FallbackController@index',
      controller: 'App\\Http\\Controllers\\FallbackController',
      controllerMethod: 'index'
    }
  ];

  it('returns every candidate when the client URL contains a runtime param', () => {
    const result = matchRoutes(
      { pattern: '/api/{param}/users', verb: 'GET' },
      AMBIGUOUS_ROUTES,
      { apiBaseUrl: '' }
    );
    expect(result.map(r => r.route.uri)).toEqual([
      '/api/template/users',
      '/api/route_book/users',
      '/api/{any}/users'
    ]);
    expect(result[0].score).toBeGreaterThan(result[2].score);
  });

  it('returns a single literal match when the URL is fully resolved', () => {
    const result = matchRoutes(
      { pattern: '/api/template/users', verb: 'GET' },
      AMBIGUOUS_ROUTES,
      { apiBaseUrl: '' }
    );
    expect(result).toHaveLength(2);
    expect(result[0].route.uri).toBe('/api/template/users');
    expect(result[1].route.uri).toBe('/api/{any}/users');
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it('returns an empty array when nothing matches', () => {
    const result = matchRoutes(
      { pattern: '/api/missing', verb: 'GET' },
      AMBIGUOUS_ROUTES,
      { apiBaseUrl: '' }
    );
    expect(result).toEqual([]);
  });

  it('falls back to verb-less matching when no verb matches', () => {
    const routes: LaravelRoute[] = [
      {
        methods: ['POST'],
        uri: '/api/users',
        action: 'A@a',
        controller: 'A',
        controllerMethod: 'a'
      }
    ];
    const result = matchRoutes({ pattern: '/api/users', verb: 'GET' }, routes, { apiBaseUrl: '' });
    expect(result).toHaveLength(1);
    expect(result[0].route.uri).toBe('/api/users');
  });

  it('does not double-count when a candidate matches multiple normalized variants', () => {
    const routes: LaravelRoute[] = [
      {
        methods: ['GET'],
        uri: '/api/users',
        action: 'A@a',
        controller: 'A',
        controllerMethod: 'a'
      }
    ];
    const result = matchRoutes(
      { pattern: 'users', verb: 'GET' },
      routes,
      { apiBaseUrl: '/api' }
    );
    expect(result).toHaveLength(1);
  });
});
