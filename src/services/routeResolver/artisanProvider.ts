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

export async function fetchRoutesViaArtisan(options: ArtisanOptions): Promise<LaravelRoute[]> {
  const stdout = await runArtisan(options);
  const trimmed = stdout.trim();
  if (!trimmed) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new ArtisanError(`Could not parse 'artisan route:list --json' output as JSON: ${(error as Error).message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new ArtisanError('Unexpected artisan output: expected a JSON array.');
  }

  return parsed.map(toLaravelRoute);
}

function runArtisan(options: ArtisanOptions): Promise<string> {
  const timeout = options.timeoutMs ?? 15_000;

  return new Promise<string>((resolve, reject) => {
    const child = spawn(options.phpBinary, ['artisan', 'route:list', '--json'], {
      cwd: options.laravelRoot,
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
    child.on('error', error => {
      clearTimeout(timer);
      reject(new ArtisanError(`Failed to spawn '${options.phpBinary}': ${error.message}`, stderr));
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
  const rawRoute = raw as RawArtisanRoute;
  const methods = normalizeMethods(rawRoute.methods ?? rawRoute.method);
  const uri = normalizeUri(rawRoute.uri ?? '');
  const action = (rawRoute.action ?? 'Closure').trim();
  const { controller, controllerMethod } = splitAction(action);

  return {
    methods,
    uri,
    name: rawRoute.name ?? undefined,
    action,
    controller,
    controllerMethod,
    middleware: normalizeMiddleware(rawRoute.middleware)
  };
}

function normalizeMethods(value: string | undefined): HttpMethod[] {
  if (!value) {
    return ['ANY'];
  }
  return value
    .split('|')
    .map(token => token.trim().toUpperCase())
    .filter(token => token !== 'HEAD')
    .map(token => token as HttpMethod);
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
  const atIndex = action.lastIndexOf('@');
  if (atIndex === -1) {
    return { controller: action };
  }
  return {
    controller: action.slice(0, atIndex),
    controllerMethod: action.slice(atIndex + 1)
  };
}

function normalizeMiddleware(value: string[] | string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value;
  }
  return value.split(',').map(token => token.trim()).filter(Boolean);
}
