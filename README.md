# Laravel-Vue Navigator

An extension for monorepos that combine a Laravel backend and a Vue (or any TS/JS) frontend.
Ctrl+Click on an `axios` endpoint inside a `.vue`, `.ts`, or `.js` file and jump straight to the
Laravel controller method that handles it.

## Features

- "Go to Definition" provider for `axios` calls. Supports:
  - Literal URLs: `axios.get('/api/users')`
  - Template literals with parameters: `` axios.post(`/api/users/${id}/posts`) ``
  - Object form: `axios({ method: 'patch', url: '/api/orders/42' })`
  - Custom wrapper instances when named like `api`, `http`, `client` (e.g. `api.delete('/api/x')`)
- **Ambiguous endpoint disambiguation:** when a runtime expression in the URL
  (e.g. `` `/api/${section}/users` ``) matches more than one Laravel route, a
  non-invasive `QuickPick` opens listing every candidate (full URI + controller
  method + file). Pick one and the editor jumps straight to the right PHP
  function. The popup closes on selection, Escape, or click outside.
  This is triggered directly when click Ctrl on the endpoint.
- Hybrid route resolution:
  1. Primary: `php artisan route:list --json` (correctly handles middleware, prefixes, resource controllers, macros).
  2. Fallback: pure-JS static parser of `routes/*.php` (no PHP required).
- File-system watcher with **500 ms debounce** on `routes/**/*.php`, `app/Http/Controllers/**/*.php`,
  `app/Providers/**/*.php`. New routes appear automatically as soon as you save.
- Stale-on-error: if a refresh fails (PHP syntax error, missing binary, etc.) the previous cache
  is kept and a warning shows in the status bar instead of breaking navigation.
- Monorepo aware: auto-detects the Laravel project (looks for `artisan`) and the Vue project
  (looks for `vue` in `package.json`) up to 3 directory levels deep.

## How it works

```
[Vue/TS/JS file]  --(Ctrl+Click)-->  [Babel AST extractor]
                                       │
                                       ▼
                          pattern: '/api/users/{param}', verb: 'GET'
                                       │
                                       ▼
        [Route cache (artisan or static parser, watched + debounced)]
                                       │
                                       ▼
       matchRoutes() → every route compatible with the pattern (sorted by specificity)
                                       │
                          ┌────────────┴─────────────┐
                          ▼                          ▼
                  1 candidate                  >1 candidate
                          │                          │
                          ▼                          ▼
                   jump directly        ambiguityStrategy:
                                          - pick  → QuickPick popup (default)
                                          - peek  → native Peek panel
                                          - first → silent best-match
                                       │
                                       ▼
       [composer.json PSR-4 resolver]  →  app/Http/Controllers/...UserController.php
                                       │
                                       ▼
           IDE opens that file at line of `public function show(...)`
```

## Requirements

- VSCode `^1.85.0`
- Node `>= 18` (for development / build)
- Optional: a PHP binary reachable as `php` (or configured via setting). When not available
  the extension transparently falls back to the static parser.

## Settings

| Setting                                  | Default          | Description                                                                                              |
| ---------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------- |
| `laravelVueNavigator.laravelPath`        | `auto`           | Workspace-relative path to the Laravel root (where `artisan` lives). `auto` to scan.                     |
| `laravelVueNavigator.frontendPath`       | `auto`           | Workspace-relative path to the Vue/TS/JS frontend root. `auto` to scan.                                     |
| `laravelVueNavigator.apiBaseUrl`         | `""`             | API path prefix for matching (e.g. `/api`). When empty, the extension reads Laravel’s `apiPrefix` from `bootstrap/app.php` (default `/api` for `routes/api.php`). Needed when axios calls `/api/...` but routes in `api.php` are declared as `user_groups` without the prefix. |
| `laravelVueNavigator.phpBinary`          | `php`            | PHP binary used to execute `artisan route:list --json`.                                                  |
| `laravelVueNavigator.useArtisan`         | `true`           | When `false`, the static parser is always used (no `php` invocation).                                    |
| `laravelVueNavigator.routeCacheTtl`      | `3600`           | Seconds before the disk cache (`.vscode/laravel-vue-navigator.cache.json`) is considered stale.          |
| `laravelVueNavigator.refreshDebounceMs`  | `500`            | Debounce window in ms for collapsing multiple PHP file saves into a single refresh.                       |
| `laravelVueNavigator.ambiguityStrategy`  | `pick`           | How the provider reacts when more than one Laravel route matches: `pick` (QuickPick popup), `peek` (native Peek panel with all locations), or `first` (silent best-match, legacy behavior). |
| `laravelVueNavigator.ambiguityScope`     | `topScoreOnly`   | Which candidates the disambiguation UI considers: `topScoreOnly` (only routes tied for the highest specificity score) or `allMatches` (every matching route, less specific ones included). Ignored when `ambiguityStrategy` is `first`. |

## Commands

- `Laravel-Vue Navigator: Refresh routes` – force a full refresh of the route cache.
- `Laravel-Vue Navigator: Show route for endpoint under cursor` – debug helper that prints the
  matched route in a notification.

## Behavior when you add a route at runtime

1. Save the file (any of `routes/**.php`, `app/Http/Controllers/**.php`, `app/Providers/**.php`).
2. After 500 ms of inactivity the extension re-runs `php artisan route:list --json`.
3. The new route becomes navigable immediately.

If artisan fails (e.g. you saved a file with a syntax error), the **previous cache is preserved**
and the status bar shows `LVN: stale`. Fix the error and save again, or click the status bar item
to force a refresh.

## Ambiguous endpoints

When the axios URL contains a runtime expression, the extension cannot tell at
parse time which concrete segment the variable will hold. For example:

```ts
let section = 'dashboard';
axios.get(`/api/${section}/users`);
```

The extracted pattern becomes `/api/{param}/users`, which can legitimately match
both:

- `GET /api/dashboard/users` → `App\Http\Controllers\Dashboard\UserController@index`
- `GET /api/homepage/users` → `App\Http\Controllers\Homepage\UserController@index`

In v0.1.0+ the extension **no longer picks one silently**. With the default
setting (`ambiguityStrategy: pick`) a small,
non-invasive `QuickPick` opens on Ctrl+Click listing every candidate:

```
GET /api/dashboard/users    App\Http\Controllers\Dashboard\UserController@index
   app/Http/Controllers/Dashboard/UserController.php

GET /api/homepage/users  App\Http\Controllers\Homepage\UserController@index
   app/Http/Controllers/Homepage/UserController.php
```

- Click → jump directly to the chosen `function`.
- Escape, click outside, or switch editor → popup closes, nothing happens.

### Tuning the behavior

- `ambiguityStrategy: peek` — return every candidate as a `LocationLink` so the IDE
  opens its native Peek Definition panel (file path + code snippet only; the route URI is not shown).
- `ambiguityStrategy: first` — restore the legacy behavior and silently jump to
  the highest-specificity match without prompting.
- `ambiguityScope: allMatches` — also include less specific fallbacks (e.g. a
  catch-all `/api/{any}/users`) when listing candidates.

When ambiguity is detected, the output channel logs a line like:

```
Ambiguous endpoint '/api/{param}/users' (GET): 2 candidate routes -> strategy=pick
```

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull
request. By participating, you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

- **Bug reports:** [open an issue](https://github.com/DanioFiore/laravel-vue-navigator/issues/new/choose)
- **Architecture deep dive:** [docs/TECHNICAL_OVERVIEW.md](docs/TECHNICAL_OVERVIEW.md)
- **Security:** see [SECURITY.md](SECURITY.md)

## Development

```bash
npm install
npm run build      # one-shot esbuild bundle
npm run watch      # watch mode for development
npm test           # vitest unit tests
npm run test:coverage  # unit tests + coverage (enforces thresholds on core services)
npm run compile    # tsc --noEmit
```

To debug inside VSCode: press `F5` (uses `.vscode/launch.json`).

Before releasing or publishing, run through the **[manual QA checklist](docs/QA_CHECKLIST.md)** on a real Laravel + Vue monorepo (navigation, QuickPick, watcher, settings, stale cache).

## Packaging and publishing

```bash
npm run package          # produces laravel-vue-navigator-<version>.vsix
code --install-extension laravel-vue-navigator-<version>.vsix  # local install for testing
npm run publish          # vsce publish (requires PAT + publisher id in package.json)
```

## What is intentionally out of scope

- Variables / constants as the **whole** URL: `const URL = '/users'; axios.get(URL)`
  still requires a mini type-flow analyzer. Template literals with `${var}`
  segments **are** supported (and disambiguated through the QuickPick described
  above).
- Hover preview with route name and middleware.
- Reverse navigation (from PHP controller to Vue callers).
- `fetch`, `ofetch`, `ky` clients (only `axios` and obvious wrappers are detected for now).

## Privacy and security

### What runs on your machine

Laravel-Vue Navigator is a **local-only** VS Code extension. It does not start a
remote service and does not send your project data to the publisher or to third
parties.

| Action | When | Data involved |
|--------|------|----------------|
| `php artisan route:list --json` | Default route refresh (`useArtisan: true`) | Spawns your configured PHP binary in the **Laravel root**; reads route definitions Laravel prints to stdout. |
| Static PHP route parser | Fallback when Artisan is off or fails | Reads `routes/*.php` (and related files the parser supports) under the Laravel root. |
| Read `composer.json` | Resolving controller file paths | PSR-4 autoload maps under the Laravel root. |
| Read frontend sources | Ctrl+Click on an axios URL | Content of the open `.vue` / `.ts` / `.js` file (in memory) for AST extraction. |
| Read controller `.php` files | Jump to definition | Opens the matched controller file locally. |
| File system watcher | After saves under `routes/`, `app/Http/Controllers/`, `app/Providers/` | Notifies the extension to refresh the route cache. |
| Disk cache | Optional persistence | Writes `.vscode/laravel-vue-navigator.cache.json` in the **workspace root** (route list JSON, no secrets). |
| Output channel | Diagnostics | Logs paths, route counts, ambiguity hints — visible only to you in the IDE. |

### Network and telemetry

- **No outbound network requests** are made by the extension at runtime (no HTTP,
  WebSocket, or analytics calls). Repository URLs in `package.json` are metadata
  for the Marketplace only; the running extension does not contact them.
- **No telemetry**, crash reporting, or usage tracking is implemented. Nothing
  is phoned home.

### Third-party code in the `.vsix`

The published bundle (`dist/extension.js`) includes
[@babel/parser](https://babel.dev/), [@babel/traverse](https://babel.dev/),
[@babel/types](https://babel.dev/), and [php-parser](https://github.com/glayzzle/php-parser)
for parsing only. See **[NOTICES.md](NOTICES.md)** for versions and license text.

### Secrets in this repository

This repo must not contain API keys, tokens, or `.env` files with secrets.
`.gitignore` blocks common patterns (`.env`, `*.pem`, `credentials.json`, etc.).

Maintainers: before each release, confirm no secrets are tracked:

```bash
git ls-files | grep -iE 'env|secret|token|credential|\.pem|\.key' || echo "OK: no sensitive filenames tracked"
```

If a secret was ever committed, rotate it and purge it from git history before publishing.

## License

MIT — see [LICENSE](LICENSE). Third-party licenses: [NOTICES.md](NOTICES.md).
