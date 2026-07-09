import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseRoutesFromFiles } from '../../services/routeResolver/staticParser';

let tmpRoot: string;

const ROUTE_FILE = `<?php

use Illuminate\\Support\\Facades\\Route;
use App\\Http\\Controllers\\UserController;
use App\\Http\\Controllers\\PostController;

Route::get('/users', [UserController::class, 'index']);
Route::post('/users', [UserController::class, 'store']);
Route::get('/users/{id}', 'App\\\\Http\\\\Controllers\\\\UserController@show');

Route::prefix('admin')->middleware('auth')->group(function () {
    Route::get('/dashboard', [UserController::class, 'dashboard']);
    Route::resource('posts', PostController::class);
});

Route::group(['prefix' => 'v2', 'middleware' => ['api']], function () {
    Route::get('/ping', [UserController::class, 'ping']);
});
`;

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lvn-test-'));
  fs.mkdirSync(path.join(tmpRoot, 'routes'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'routes', 'api.php'), ROUTE_FILE, 'utf-8');
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('staticParser', () => {
  it('parses literal GET and POST routes', () => {
    const routes = parseRoutesFromFiles({ laravelRoot: tmpRoot });
    const get = routes.find(r => r.uri === '/users' && r.methods[0] === 'GET');
    const post = routes.find(r => r.uri === '/users' && r.methods[0] === 'POST');
    expect(get?.controllerMethod).toBe('index');
    expect(post?.controllerMethod).toBe('store');
  });

  it('parses string-style action App\\Http\\Controllers\\UserController@show', () => {
    const routes = parseRoutesFromFiles({ laravelRoot: tmpRoot });
    const show = routes.find(r => r.uri === '/users/{id}');
    expect(show?.controller).toContain('UserController');
    expect(show?.controllerMethod).toBe('show');
  });

  it('applies prefix() and middleware() chain to grouped routes', () => {
    const routes = parseRoutesFromFiles({ laravelRoot: tmpRoot });
    const dashboard = routes.find(r => r.uri === '/admin/dashboard');
    expect(dashboard?.controllerMethod).toBe('dashboard');
    expect(dashboard?.middleware).toContain('auth');
  });

  it('expands Route::resource into 7 routes', () => {
    const routes = parseRoutesFromFiles({ laravelRoot: tmpRoot });
    const postsRoutes = routes.filter(r => r.uri.startsWith('/admin/posts'));
    const actions = postsRoutes.map(r => r.controllerMethod).sort();
    expect(actions).toEqual(['create', 'destroy', 'edit', 'index', 'show', 'store', 'update'].sort());
  });

  it('applies prefix and middleware from associative array group', () => {
    const routes = parseRoutesFromFiles({ laravelRoot: tmpRoot });
    const ping = routes.find(r => r.uri === '/v2/ping');
    expect(ping?.controllerMethod).toBe('ping');
    expect(ping?.middleware).toContain('api');
  });

  it('applies Laravel bootstrap api prefix to routes parsed from api.php only', () => {
    const routes = parseRoutesFromFiles({
      laravelRoot: tmpRoot,
      apiRoutePrefix: '/api'
    });
    const get = routes.find(r => r.methods[0] === 'GET' && r.uri === '/api/users');
    expect(get?.controllerMethod).toBe('index');
    const grouped = routes.find(r => r.uri === '/api/admin/dashboard');
    expect(grouped?.controllerMethod).toBe('dashboard');
  });
});
