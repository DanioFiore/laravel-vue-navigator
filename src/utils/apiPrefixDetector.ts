import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Laravel applies an API URI prefix when loading `routes/api.php` (bootstrap/app.php
 * `apiPrefix`, or `Route::prefix('api')->group(base_path('routes/api.php'))`).
 * The static parser only reads route files and misses that outer prefix.
 */
export function detectApiRoutePrefix(laravelRoot: string): string {
  const fromBootstrap = readBootstrapApiPrefix(laravelRoot);
  if (fromBootstrap) {
    return fromBootstrap;
  }
  return '/api';
}

function readBootstrapApiPrefix(laravelRoot: string): string {
  const bootstrapPath = path.join(laravelRoot, 'bootstrap', 'app.php');
  if (!fs.existsSync(bootstrapPath)) {
    return '';
  }
  try {
    const source = fs.readFileSync(bootstrapPath, 'utf-8');
    const explicit = source.match(/apiPrefix\s*:\s*['"]([^'"]+)['"]/);
    if (explicit?.[1]) {
      return normalizePrefix(explicit[1]);
    }
    const groupPrefix = source.match(
      /prefix\s*\(\s*['"]([^'"]+)['"]\s*\)\s*(?:->[\w()]+\([^)]*\)\s*)*->\s*group\s*\(\s*base_path\s*\(\s*['"]routes\/api\.php['"]\s*\)/
    );
    if (groupPrefix?.[1]) {
      return normalizePrefix(groupPrefix[1]);
    }
  } catch {
    return '';
  }
  return '';
}

function normalizePrefix(value: string): string {
  const v = value.trim().replace(/\/+$/, '');
  if (!v) {
    return '';
  }
  return v.startsWith('/') ? v : `/${v}`;
}
