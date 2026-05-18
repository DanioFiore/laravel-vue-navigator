import * as vscode from 'vscode';

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
}

const SECTION = 'laravelVueNavigator';

const AMBIGUITY_STRATEGIES: ReadonlyArray<AmbiguityStrategy> = ['pick', 'peek', 'first'];
const AMBIGUITY_SCOPES: ReadonlyArray<AmbiguityScope> = ['topScoreOnly', 'allMatches'];

export function getConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration(SECTION);

  return {
    laravelPath: cfg.get<string>('laravelPath', 'auto'),
    frontendPath: cfg.get<string>('frontendPath', 'auto'),
    apiBaseUrl: normalizeBaseUrl(cfg.get<string>('apiBaseUrl', '')),
    phpBinary: cfg.get<string>('phpBinary', 'php'),
    useArtisan: cfg.get<boolean>('useArtisan', true),
    routeCacheTtlSeconds: cfg.get<number>('routeCacheTtl', 3600),
    refreshDebounceMs: cfg.get<number>('refreshDebounceMs', 500),
    ambiguityStrategy: coerceEnum<AmbiguityStrategy>(
      cfg.get<string>('ambiguityStrategy', 'pick'),
      AMBIGUITY_STRATEGIES,
      'pick'
    ),
    ambiguityScope: coerceEnum<AmbiguityScope>(
      cfg.get<string>('ambiguityScope', 'topScoreOnly'),
      AMBIGUITY_SCOPES,
      'topScoreOnly'
    )
  };
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
  let v = value.trim();
  if (v.endsWith('/')) {
    v = v.slice(0, -1);
  }
  if (v && !v.startsWith('/')) {
    v = '/' + v;
  }
  return v;
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
