import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseRoutesFromFiles } from '../../services/routeResolver/staticParser';

let tempRoot: string;

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
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lvn-test-'));
  fs.mkdirSync(path.join(tempRoot, 'routes'), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, 'routes', 'api.php'), ROUTE_FILE, 'utf-8');
});

afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('staticParser', () => {
  it('parses literal GET and POST routes', () => {
    const routes = parseRoutesFromFiles({ laravelRoot: tempRoot });
    const getRoute = routes.find(route => route.uri === '/users' && route.methods[0] === 'GET');
    const postRoute = routes.find(route => route.uri === '/users' && route.methods[0] === 'POST');
    expect(getRoute?.controllerMethod).toBe('index');
    expect(postRoute?.controllerMethod).toBe('store');
  });

  it('parses string-style action App\\Http\\Controllers\\UserController@show', () => {
    const routes = parseRoutesFromFiles({ laravelRoot: tempRoot });
    const show = routes.find(route => route.uri === '/users/{id}');
    expect(show?.controller).toContain('UserController');
    expect(show?.controllerMethod).toBe('show');
  });

  it('applies prefix() and middleware() chain to grouped routes', () => {
    const routes = parseRoutesFromFiles({ laravelRoot: tempRoot });
    const dashboard = routes.find(route => route.uri === '/admin/dashboard');
    expect(dashboard?.controllerMethod).toBe('dashboard');
    expect(dashboard?.middleware).toContain('auth');
  });

  it('expands Route::resource into 7 routes', () => {
    const routes = parseRoutesFromFiles({ laravelRoot: tempRoot });
    const postsRoutes = routes.filter(route => route.uri.startsWith('/admin/posts'));
    const actions = postsRoutes.map(route => route.controllerMethod).sort();
    expect(actions).toEqual(['create', 'destroy', 'edit', 'index', 'show', 'store', 'update'].sort());
  });

  it('uses singular resource parameter for Route::resource show/edit/update/destroy', () => {
    const routes = parseRoutesFromFiles({ laravelRoot: tempRoot });
    const show = routes.find(route => route.uri === '/admin/posts/{post}' && route.controllerMethod === 'show');
    const edit = routes.find(route => route.uri === '/admin/posts/{post}/edit');
    expect(show?.controller).toBe('PostController');
    expect(edit?.controllerMethod).toBe('edit');
  });

  it('applies prefix and middleware from associative array group', () => {
    const routes = parseRoutesFromFiles({ laravelRoot: tempRoot });
    const ping = routes.find(route => route.uri === '/v2/ping');
    expect(ping?.controllerMethod).toBe('ping');
    expect(ping?.middleware).toContain('api');
  });

  it('applies Laravel bootstrap api prefix to routes parsed from api.php only', () => {
    const routes = parseRoutesFromFiles({
      laravelRoot: tempRoot,
      apiRoutePrefix: '/api'
    });
    const getRoute = routes.find(route => route.methods[0] === 'GET' && route.uri === '/api/users');
    expect(getRoute?.controllerMethod).toBe('index');
    const grouped = routes.find(route => route.uri === '/api/admin/dashboard');
    expect(grouped?.controllerMethod).toBe('dashboard');
  });

  it('loads routes from Route::prefix(...)->group(base_path(...)) includes', () => {
    const versionedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lvn-versioned-'));
    fs.mkdirSync(path.join(versionedRoot, 'routes'), { recursive: true });
    fs.writeFileSync(
      path.join(versionedRoot, 'routes', 'api.php'),
      `<?php

use Illuminate\\Support\\Facades\\Route;

Route::prefix('v1')->group(base_path('routes/api_v1.php'));
`,
      'utf-8'
    );
    fs.writeFileSync(
      path.join(versionedRoot, 'routes', 'api_v1.php'),
      `<?php

use Illuminate\\Support\\Facades\\Route;
use App\\Http\\Controllers\\ProductsController;

Route::get('/products', [ProductsController::class, 'index']);
`,
      'utf-8'
    );

    try {
      const routes = parseRoutesFromFiles({
        laravelRoot: versionedRoot,
        apiRoutePrefix: '/api'
      });
      const products = routes.find(route => route.uri === '/api/v1/products' && route.methods[0] === 'GET');
      expect(products?.controllerMethod).toBe('index');
    } finally {
      fs.rmSync(versionedRoot, { recursive: true, force: true });
    }
  });

  it('expands Route::resources array into standard CRUD routes per entry', () => {
    const resourcesRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lvn-resources-'));
    fs.mkdirSync(path.join(resourcesRoot, 'routes'), { recursive: true });
    fs.writeFileSync(
      path.join(resourcesRoot, 'routes', 'api.php'),
      `<?php

use Illuminate\\Support\\Facades\\Route;
use App\\Http\\Controllers\\PostController;
use App\\Http\\Controllers\\CommentController;
use App\\Http\\Controllers\\CategoryController;
use App\\Http\\Controllers\\StatusCodeController;
use App\\Http\\Controllers\\PostReviewController;
use App\\Http\\Controllers\\ItemController;
use App\\Http\\Controllers\\ItemAttachmentController;
use App\\Http\\Controllers\\PreferenceController;

Route::resources([
    'posts' => PostController::class,
    'comments' => CommentController::class,
    'categories' => CategoryController::class,
    'status_codes' => StatusCodeController::class,
    'posts/{post_id}/reviews' => PostReviewController::class,
    'admin/items' => ItemController::class,
    'admin/items/attachments' => ItemAttachmentController::class,
    'settings/preferences' => PreferenceController::class
]);
`,
      'utf-8'
    );

    try {
      const routes = parseRoutesFromFiles({ laravelRoot: resourcesRoot });

      const postsIndex = routes.find(route => route.uri === '/posts' && route.methods[0] === 'GET');
      expect(postsIndex?.controller).toBe('PostController');
      expect(postsIndex?.controllerMethod).toBe('index');

      const postsStore = routes.find(route => route.uri === '/posts' && route.methods[0] === 'POST');
      expect(postsStore?.controllerMethod).toBe('store');

      const postsShow = routes.find(route => route.uri === '/posts/{post}');
      expect(postsShow?.controllerMethod).toBe('show');

      const statusShow = routes.find(route => route.uri === '/status_codes/{status_code}');
      expect(statusShow?.controller).toBe('StatusCodeController');
      expect(statusShow?.controllerMethod).toBe('show');

      const nestedIndex = routes.find(
        r => r.uri === '/posts/{post_id}/reviews' && r.controllerMethod === 'index'
      );
      expect(nestedIndex?.controller).toBe('PostReviewController');

      const nestedShow = routes.find(
        r => r.uri === '/posts/{post_id}/reviews/{review}' && r.controllerMethod === 'show'
      );
      expect(nestedShow?.controller).toBe('PostReviewController');

      const itemsIndex = routes.find(route => route.uri === '/admin/items' && route.controllerMethod === 'index');
      expect(itemsIndex?.controller).toBe('ItemController');

      const attachmentDestroy = routes.find(
        r => r.uri === '/admin/items/attachments/{attachment}' && r.controllerMethod === 'destroy'
      );
      expect(attachmentDestroy?.controller).toBe('ItemAttachmentController');

      const resourceControllers = new Set(
        routes.filter(route => route.controllerMethod === 'index').map(route => route.controller)
      );
      expect(resourceControllers.size).toBe(8);
      expect(routes.filter(route => route.controllerMethod === 'index').length).toBe(8);
      expect(routes.length).toBe(56);
    } finally {
      fs.rmSync(resourcesRoot, { recursive: true, force: true });
    }
  });

  it('expands Route::apiResources without create and edit routes', () => {
    const apiResourcesRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lvn-apiresources-'));
    fs.mkdirSync(path.join(apiResourcesRoot, 'routes'), { recursive: true });
    fs.writeFileSync(
      path.join(apiResourcesRoot, 'routes', 'api.php'),
      `<?php

use Illuminate\\Support\\Facades\\Route;
use App\\Http\\Controllers\\PostController;
use App\\Http\\Controllers\\CommentController;

Route::apiResources([
    'posts' => PostController::class,
    'comments' => CommentController::class,
]);
`,
      'utf-8'
    );

    try {
      const routes = parseRoutesFromFiles({ laravelRoot: apiResourcesRoot });
      const actions = [...new Set(routes.map(route => route.controllerMethod))].sort();
      expect(actions).toEqual(['destroy', 'index', 'show', 'store', 'update'].sort());
      expect(routes.length).toBe(10);
      expect(routes.some(r => r.uri === '/posts/create')).toBe(false);
      expect(routes.some(r => r.uri.endsWith('/edit'))).toBe(false);
    } finally {
      fs.rmSync(apiResourcesRoot, { recursive: true, force: true });
    }
  });

  it('applies chained prefix and middleware to Route::resources', () => {
    const prefixedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lvn-resources-prefixed-'));
    fs.mkdirSync(path.join(prefixedRoot, 'routes'), { recursive: true });
    fs.writeFileSync(
      path.join(prefixedRoot, 'routes', 'api.php'),
      `<?php

use Illuminate\\Support\\Facades\\Route;
use App\\Http\\Controllers\\ArticleController;

Route::prefix('v1')->middleware('auth')->resources([
    'articles' => ArticleController::class,
]);
`,
      'utf-8'
    );

    try {
      const routes = parseRoutesFromFiles({ laravelRoot: prefixedRoot });
      const index = routes.find(route => route.uri === '/v1/articles' && route.controllerMethod === 'index');
      expect(index?.middleware).toContain('auth');
      expect(routes.filter(route => route.uri.startsWith('/v1/articles')).length).toBe(7);
    } finally {
      fs.rmSync(prefixedRoot, { recursive: true, force: true });
    }
  });
});
