import * as fs from 'node:fs';
import * as path from 'node:path';
import { LaravelRoute, RouteCachePayload } from '../../models/route';

const CACHE_FILENAME = 'laravel-vue-navigator.cache.json';

export interface CacheReadOptions {
  readonly ttlSeconds: number;
}

export class RouteCache {
  private readonly cachePath: string;
  private inMemory: RouteCachePayload | undefined;

  constructor(workspaceRoot: string) {
    this.cachePath = path.join(workspaceRoot, '.vscode', CACHE_FILENAME);
  }

  get filePath(): string {
    return this.cachePath;
  }

  getInMemory(): RouteCachePayload | undefined {
    return this.inMemory;
  }

  read({ ttlSeconds }: CacheReadOptions): RouteCachePayload | undefined {
    if (this.inMemory) {
      if (isFresh(this.inMemory, ttlSeconds)) {
        return this.inMemory;
      }
    }
    if (!fs.existsSync(this.cachePath)) {
      return undefined;
    }
    try {
      const raw = fs.readFileSync(this.cachePath, 'utf-8');
      const parsed = JSON.parse(raw) as RouteCachePayload;
      if (parsed.version !== 1 || !Array.isArray(parsed.routes)) {
        return undefined;
      }
      this.inMemory = parsed;
      if (!isFresh(parsed, ttlSeconds)) {
        return undefined;
      }
      return parsed;
    } catch {
      return undefined;
    }
  }

  write(routes: LaravelRoute[], source: 'artisan' | 'static'): RouteCachePayload {
    const payload: RouteCachePayload = {
      version: 1,
      generatedAt: Date.now(),
      source,
      routes
    };
    this.inMemory = payload;
    try {
      fs.mkdirSync(path.dirname(this.cachePath), { recursive: true });
      fs.writeFileSync(this.cachePath, JSON.stringify(payload), 'utf-8');
    } catch {
      // disk failure: keep in-memory copy, do not throw
    }
    return payload;
  }

  invalidate(): void {
    this.inMemory = undefined;
    try {
      if (fs.existsSync(this.cachePath)) {
        fs.unlinkSync(this.cachePath);
      }
    } catch {
      // ignore
    }
  }

  setInMemory(payload: RouteCachePayload): void {
    this.inMemory = payload;
  }
}

function isFresh(payload: RouteCachePayload, ttlSeconds: number): boolean {
  if (ttlSeconds <= 0) {
    return true;
  }
  return Date.now() - payload.generatedAt < ttlSeconds * 1000;
}
