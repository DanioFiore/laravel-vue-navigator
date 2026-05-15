import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fetchRoutesViaArtisan } from '../../services/routeResolver/artisanProvider';

let tmpRoot: string;
let fakeArtisan: string;

const FAKE_PHP = `#!/usr/bin/env node
const route = process.argv.slice(2).join(' ');
if (route.includes('route:list')) {
  process.stdout.write(JSON.stringify([
    { methods: 'GET|HEAD', uri: 'api/users', name: 'users.index', action: 'App\\\\Http\\\\Controllers\\\\UserController@index', middleware: ['api'] },
    { methods: 'POST', uri: 'api/users', name: 'users.store', action: 'App\\\\Http\\\\Controllers\\\\UserController@store', middleware: ['api'] },
    { methods: 'GET', uri: 'api/users/{id}', action: 'App\\\\Http\\\\Controllers\\\\UserController@show' }
  ]));
  process.exit(0);
}
process.exit(1);
`;

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lvn-artisan-'));
  fs.writeFileSync(path.join(tmpRoot, 'artisan'), '', 'utf-8');
  fakeArtisan = path.join(tmpRoot, 'fake-php');
  fs.writeFileSync(fakeArtisan, FAKE_PHP, 'utf-8');
  fs.chmodSync(fakeArtisan, 0o755);
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('fetchRoutesViaArtisan', () => {
  it('parses JSON output produced by a faux php artisan', async () => {
    const routes = await fetchRoutesViaArtisan({
      phpBinary: fakeArtisan,
      laravelRoot: tmpRoot
    });
    expect(routes).toHaveLength(3);
    const show = routes.find(r => r.uri === '/api/users/{id}');
    expect(show?.controller).toBe('App\\Http\\Controllers\\UserController');
    expect(show?.controllerMethod).toBe('show');
    const index = routes.find(r => r.uri === '/api/users' && r.methods.includes('GET'));
    expect(index?.methods).not.toContain('HEAD');
    expect(index?.middleware).toContain('api');
  });

  it('throws ArtisanError when the binary exits non-zero', async () => {
    await expect(
      fetchRoutesViaArtisan({ phpBinary: 'nonexistent-binary-xyz', laravelRoot: tmpRoot })
    ).rejects.toThrow();
  });
});
