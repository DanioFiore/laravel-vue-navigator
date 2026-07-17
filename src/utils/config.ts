import * as vscode from 'vscode';
import { detectApiRoutePrefix } from './apiPrefixDetector';

export type AmbiguityStrategy = 'pick' | 'peek' | 'first';
export type AmbiguityScope = 'topScoreOnly' | 'allMatches';

export interface ExtensionConfig {
  readonly laravelPath: string;
  readonly frontendPath: string;
  readonly apiBaseUrl: string;
  readonly phpBinary: string;
  readonly useArtisan: boolean;
  readonly routeCacheTtlSeconds: number;
  readonly refreshDebounceMs: number;
  readonly ambiguityStrategy: AmbiguityStrategy;
  readonly ambiguityScope: AmbiguityScope;
  readonly underlineUrls: boolean;
}

const SECTION = 'laravelVueNavigator';

const AMBIGUITY_STRATEGIES: ReadonlyArray<AmbiguityStrategy> = ['pick', 'peek', 'first'];
const AMBIGUITY_SCOPES: ReadonlyArray<AmbiguityScope> = ['topScoreOnly', 'allMatches'];

export function getConfig(): ExtensionConfig {
  const configuration = vscode.workspace.getConfiguration(SECTION);

  return {
    laravelPath: configuration.get<string>('laravelPath', 'auto'),
    frontendPath: configuration.get<string>('frontendPath', 'auto'),
    apiBaseUrl: normalizeBaseUrl(configuration.get<string>('apiBaseUrl', '')),
    phpBinary: configuration.get<string>('phpBinary', 'php'),
    useArtisan: configuration.get<boolean>('useArtisan', true),
    routeCacheTtlSeconds: configuration.get<number>('routeCacheTtl', 3600),
    refreshDebounceMs: configuration.get<number>('refreshDebounceMs', 500),
    ambiguityStrategy: coerceEnum<AmbiguityStrategy>(
      configuration.get<string>('ambiguityStrategy', 'pick'),
      AMBIGUITY_STRATEGIES,
      'pick'
    ),
    ambiguityScope: coerceEnum<AmbiguityScope>(
      configuration.get<string>('ambiguityScope', 'topScoreOnly'),
      AMBIGUITY_SCOPES,
      'topScoreOnly'
    ),
    underlineUrls: configuration.get<boolean>('underlineUrls', true)
  };
}

/** User setting wins; otherwise Laravel bootstrap `apiPrefix` (default `/api`). */
export function effectiveApiBaseUrl(configured: string, laravelRoot: string): string {
  return configured || detectApiRoutePrefix(laravelRoot);
}

export function onConfigChange(callback: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration(SECTION)) {
      callback();
    }
  });
}

function normalizeBaseUrl(value: string): string {
  if (!value) {
    return '';
  }
  let normalized = value.trim();
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  if (normalized && !normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }
  return normalized;
}

function coerceEnum<T extends string>(
  raw: string | undefined,
  allowed: ReadonlyArray<T>,
  fallback: T
): T {
  if (raw && (allowed as ReadonlyArray<string>).includes(raw)) {
    return raw as T;
  }
  return fallback;
}
