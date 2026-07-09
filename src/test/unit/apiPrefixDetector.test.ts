import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { detectApiRoutePrefix } from '../../utils/apiPrefixDetector';

let tmpRoot: string;

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lvn-api-prefix-'));
  fs.mkdirSync(path.join(tmpRoot, 'bootstrap'), { recursive: true });
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('detectApiRoutePrefix', () => {
  it('reads apiPrefix from bootstrap/app.php', () => {
    fs.writeFileSync(
      path.join(tmpRoot, 'bootstrap', 'app.php'),
      `return Application::configure()->withRouting(apiPrefix: 'api/admin', api: __DIR__.'/../routes/api.php');`,
      'utf-8'
    );
    expect(detectApiRoutePrefix(tmpRoot)).toBe('/api/admin');
  });

  it('defaults to /api when bootstrap has no apiPrefix', () => {
    fs.writeFileSync(path.join(tmpRoot, 'bootstrap', 'app.php'), 'return Application::configure();', 'utf-8');
    expect(detectApiRoutePrefix(tmpRoot)).toBe('/api');
  });
});
