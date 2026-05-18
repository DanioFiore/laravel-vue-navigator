# Laravel-Vue Navigator

A VSCode extension for monorepos that combine a Laravel backend and a Vue (or any TS/JS) frontend.
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
[Vue/TS file]  --(Ctrl+Click)-->  [Babel AST extractor]
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
                                          - pick  → QuickPick popup
                                          - peek  → native Peek panel
                                          - first → silent best-match
                                       │
                                       ▼
       [composer.json PSR-4 resolver]  →  app/Http/Controllers/...UserController.php
                                       │
                                       ▼
           VSCode opens that file at line of `public function show(...)`
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
| `laravelVueNavigator.frontendPath`       | `auto`           | Workspace-relative path to the Vue/TS frontend root. `auto` to scan.                                     |
| `laravelVueNavigator.apiBaseUrl`         | `""`             | URL prefix to prepend when an axios path does not start with `/`. Example: `/api`.                       |
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
let section = 'template';
axios.get(`/api/${section}/users`);
```

The extracted pattern becomes `/api/{param}/users`, which can legitimately match
both:

- `GET /api/template/users` → `App\Http\Controllers\Template\UserController@index`
- `GET /api/route_book/users` → `App\Http\Controllers\RouteBook\UserController@index`

In v0.1.0+ the extension **no longer picks one silently**. With the default
settings (`ambiguityStrategy: pick`, `ambiguityScope: topScoreOnly`) a small,
non-invasive `QuickPick` opens on Ctrl+Click listing every candidate:

```
GET /api/template/users    App\Http\Controllers\Template\UserController@index
   app/Http/Controllers/Template/UserController.php

GET /api/route_book/users  App\Http\Controllers\RouteBook\UserController@index
   app/Http/Controllers/RouteBook/UserController.php
```

- Click (or Enter) → jump directly to the chosen `function`.
- Escape, click outside, or switch editor → popup closes, nothing happens.

### Tuning the behavior

- `ambiguityStrategy: peek` — return every candidate as a `LocationLink` so VS
  Code opens its native Peek Definition panel (file path + code snippet only;
  the route URI is not shown).
- `ambiguityStrategy: first` — restore the legacy behavior and silently jump to
  the highest-specificity match without prompting.
- `ambiguityScope: allMatches` — also include less specific fallbacks (e.g. a
  catch-all `/api/{any}/users`) when listing candidates.

When ambiguity is detected, the output channel logs a line like:

```
Ambiguous endpoint '/api/{param}/users' (GET): 2 candidate routes -> strategy=pick
```

## Development

```bash
npm install
npm run build      # one-shot esbuild bundle
npm run watch      # watch mode for development
npm test           # vitest unit tests
npm run compile    # tsc --noEmit
```

To debug inside VSCode: press `F5` (uses `.vscode/launch.json`).

## Packaging and publishing

```bash
npm run package          # produces laravel-vue-navigator-<version>.vsix
code --install-extension laravel-vue-navigator-<version>.vsix  # local install for testing
npm run publish          # vsce publish (requires PAT + publisher id in package.json)
```

## What is intentionally out of scope (yet)

- Variables / constants as the **whole** URL: `const URL = '/users'; axios.get(URL)`
  still requires a mini type-flow analyzer. Template literals with `${var}`
  segments **are** supported (and disambiguated through the QuickPick described
  above).
- Hover preview with route name and middleware.
- Reverse navigation (from PHP controller to Vue callers).
- `fetch`, `ofetch`, `ky` clients (only `axios` and obvious wrappers are detected for now).

## License

MIT
