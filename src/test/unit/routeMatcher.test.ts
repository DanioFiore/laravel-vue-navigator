import { describe, expect, it } from 'vitest';
import { LaravelRoute } from '../../models/route';
import { matchRoute } from '../../services/routeMatcher';

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
