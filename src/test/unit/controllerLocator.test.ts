import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearComposerCache, locateController } from '../../services/controllerLocator';
import { LaravelRoute } from '../../models/route';

let tmpRoot: string;
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

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lvn-loc-'));
  fs.writeFileSync(path.join(tmpRoot, 'composer.json'), JSON.stringify(COMPOSER), 'utf-8');
  const dir = path.join(tmpRoot, 'app', 'Http', 'Controllers');
  fs.mkdirSync(dir, { recursive: true });
  controllerFile = path.join(dir, 'UserController.php');
  fs.writeFileSync(controllerFile, CONTROLLER_PHP, 'utf-8');
  clearComposerCache();
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
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
    const result = locateController(makeRoute('index'), { laravelRoot: tmpRoot });
    expect(result?.file).toBe(controllerFile);
    expect(result?.line).toBeGreaterThan(0);
    const lines = fs.readFileSync(controllerFile, 'utf-8').split('\n');
    expect(lines[result!.line]).toMatch(/function\s+index\s*\(/);
  });

  it('resolves a protected static method', () => {
    const result = locateController(makeRoute('helper'), { laravelRoot: tmpRoot });
    expect(result?.file).toBe(controllerFile);
    const lines = fs.readFileSync(controllerFile, 'utf-8').split('\n');
    expect(lines[result!.line]).toMatch(/function\s+helper\s*\(/);
  });

  it('falls back to line 0 if method not found', () => {
    const result = locateController(makeRoute('ghost'), { laravelRoot: tmpRoot });
    expect(result?.file).toBe(controllerFile);
    expect(result?.line).toBe(0);
  });

  it('returns undefined when controller file does not exist', () => {
    const route: LaravelRoute = {
      methods: ['GET'],
      uri: '/x',
      action: 'App\\Http\\Controllers\\GhostController@index',
      controller: 'App\\Http\\Controllers\\GhostController',
      controllerMethod: 'index'
    };
    const result = locateController(route, { laravelRoot: tmpRoot });
    expect(result).toBeUndefined();
  });
});
