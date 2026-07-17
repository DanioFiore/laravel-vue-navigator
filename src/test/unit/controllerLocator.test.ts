import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearComposerCache, locateController } from '../../services/controllerLocator';
import { LaravelRoute } from '../../models/route';

let tempRoot: string;
let controllerFile: string;

const COMPOSER = {
  autoload: {
    'psr-4': {
      'App\\': 'app/'
    }
  }
};

const CONTROLLER_PHP = `<?php
namespace App\\Http\\Controllers;

class UserController
{
    public function index()
    {
        return [];
    }

    protected static function helper(): void
    {
    }

    public function show(int $id)
    {
        return ['id' => $id];
    }
}
`;

const INVOKABLE_PHP = `<?php
namespace App\\Http\\Controllers;

class ShowDashboard
{
    public function __invoke()
    {
        return view('dashboard');
    }
}
`;

let invokableFile: string;

beforeAll(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lvn-loc-'));
  fs.writeFileSync(path.join(tempRoot, 'composer.json'), JSON.stringify(COMPOSER), 'utf-8');
  const controllersDir = path.join(tempRoot, 'app', 'Http', 'Controllers');
  fs.mkdirSync(controllersDir, { recursive: true });
  controllerFile = path.join(controllersDir, 'UserController.php');
  fs.writeFileSync(controllerFile, CONTROLLER_PHP, 'utf-8');
  invokableFile = path.join(controllersDir, 'ShowDashboard.php');
  fs.writeFileSync(invokableFile, INVOKABLE_PHP, 'utf-8');
  clearComposerCache();
});

afterAll(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  clearComposerCache();
});

function makeRoute(method: string): LaravelRoute {
  return {
    methods: ['GET'],
    uri: '/x',
    action: `App\\Http\\Controllers\\UserController@${method}`,
    controller: 'App\\Http\\Controllers\\UserController',
    controllerMethod: method
  };
}

describe('locateController', () => {
  it('resolves a public method to its line', () => {
    const result = locateController(makeRoute('index'), { laravelRoot: tempRoot });
    expect(result?.file).toBe(controllerFile);
    expect(result?.line).toBeGreaterThan(0);
    const lines = fs.readFileSync(controllerFile, 'utf-8').split('\n');
    expect(lines[result!.line]).toMatch(/function\s+index\s*\(/);
  });

  it('resolves a protected static method', () => {
    const result = locateController(makeRoute('helper'), { laravelRoot: tempRoot });
    expect(result?.file).toBe(controllerFile);
    const lines = fs.readFileSync(controllerFile, 'utf-8').split('\n');
    expect(lines[result!.line]).toMatch(/function\s+helper\s*\(/);
  });

  it('falls back to line 0 if method not found', () => {
    const result = locateController(makeRoute('ghost'), { laravelRoot: tempRoot });
    expect(result?.file).toBe(controllerFile);
    expect(result?.line).toBe(0);
  });

  it('resolves short controller name from static parser (UserController::class)', () => {
    const route: LaravelRoute = {
      methods: ['GET'],
      uri: '/users',
      action: 'UserController@index',
      controller: 'UserController',
      controllerMethod: 'index'
    };
    const result = locateController(route, { laravelRoot: tempRoot });
    expect(result?.file).toBe(controllerFile);
    expect(result?.line).toBeGreaterThan(0);
  });

  it('resolves single-action (__invoke) controllers when controllerMethod is absent', () => {
    const route: LaravelRoute = {
      methods: ['GET'],
      uri: '/dashboard',
      action: 'App\\Http\\Controllers\\ShowDashboard',
      controller: 'App\\Http\\Controllers\\ShowDashboard'
      // controllerMethod intentionally omitted (invokable controller)
    };
    const result = locateController(route, { laravelRoot: tempRoot });
    expect(result?.file).toBe(invokableFile);
    expect(result?.line).toBeGreaterThan(0);
    const lines = fs.readFileSync(invokableFile, 'utf-8').split('\n');
    expect(lines[result!.line]).toMatch(/function\s+__invoke\s*\(/);
  });

  it('returns undefined when controller file does not exist', () => {
    const route: LaravelRoute = {
      methods: ['GET'],
      uri: '/x',
      action: 'App\\Http\\Controllers\\GhostController@index',
      controller: 'App\\Http\\Controllers\\GhostController',
      controllerMethod: 'index'
    };
    const result = locateController(route, { laravelRoot: tempRoot });
    expect(result).toBeUndefined();
  });
});
