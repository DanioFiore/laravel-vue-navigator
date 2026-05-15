import { spawn } from 'node:child_process';
import { HttpMethod, LaravelRoute } from '../../models/route';

export class ArtisanError extends Error {
  constructor(message: string, public readonly stderr?: string) {
    super(message);
    this.name = 'ArtisanError';
  }
}

export interface ArtisanOptions {
  readonly phpBinary: string;
  readonly laravelRoot: string;
  readonly timeoutMs?: number;
}

interface RawArtisanRoute {
  method?: string;
  methods?: string;
  uri?: string;
  name?: string | null;
  action?: string;
  middleware?: string[] | string;
}

export async function fetchRoutesViaArtisan(opts: ArtisanOptions): Promise<LaravelRoute[]> {
  const stdout = await runArtisan(opts);
  const trimmed = stdout.trim();
  if (!trimmed) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    throw new ArtisanError(`Could not parse 'artisan route:list --json' output as JSON: ${(err as Error).message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new ArtisanError('Unexpected artisan output: expected a JSON array.');
  }

  return parsed.map(toLaravelRoute);
}

function runArtisan(opts: ArtisanOptions): Promise<string> {
  const timeout = opts.timeoutMs ?? 15_000;

  return new Promise<string>((resolve, reject) => {
    const child = spawn(opts.phpBinary, ['artisan', 'route:list', '--json'], {
      cwd: opts.laravelRoot,
      env: process.env
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new ArtisanError(`artisan route:list timed out after ${timeout}ms`));
    }, timeout);

    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf-8');
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString('utf-8');
    });
    child.on('error', err => {
      clearTimeout(timer);
      reject(new ArtisanError(`Failed to spawn '${opts.phpBinary}': ${err.message}`, stderr));
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new ArtisanError(`artisan exited with code ${code}`, stderr || stdout));
        return;
      }
      resolve(stdout);
    });
  });
}

function toLaravelRoute(raw: unknown): LaravelRoute {
  const r = raw as RawArtisanRoute;
  const methods = normalizeMethods(r.methods ?? r.method);
  const uri = normalizeUri(r.uri ?? '');
  const action = (r.action ?? 'Closure').trim();
  const { controller, controllerMethod } = splitAction(action);

  return {
    methods,
    uri,
    name: r.name ?? undefined,
    action,
    controller,
    controllerMethod,
    middleware: normalizeMiddleware(r.middleware)
  };
}

function normalizeMethods(value: string | undefined): HttpMethod[] {
  if (!value) {
    return ['ANY'];
  }
  return value
    .split('|')
    .map(v => v.trim().toUpperCase())
    .filter(v => v !== 'HEAD')
    .map(v => v as HttpMethod);
}

function normalizeUri(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed) {
    return '/';
  }
  return trimmed.startsWith('/') ? trimmed : '/' + trimmed;
}

function splitAction(action: string): { controller?: string; controllerMethod?: string } {
  if (action === 'Closure' || action.includes('\\Closure')) {
    return {};
  }
  const at = action.lastIndexOf('@');
  if (at === -1) {
    return { controller: action };
  }
  return {
    controller: action.slice(0, at),
    controllerMethod: action.slice(at + 1)
  };
}

function normalizeMiddleware(value: string[] | string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value;
  }
  return value.split(',').map(v => v.trim()).filter(Boolean);
}
