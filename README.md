# Laravel-Vue Navigator

> **Ctrl+Click** an `axios` URL in Vue / TS / JS → jump to the Laravel controller method. Built for monorepos.

---

## The problem

In a Laravel + Vue monorepo, frontend calls and backend handlers live in different trees. Finding which controller serves `axios.get('/api/users')` means leaving the editor, grepping routes, or opening `routes/api.php` by hand.

## The solution

The extension resolves the URL against your Laravel route list and opens the matching `public function …` in the controller.

**Works with**

- Literal URLs — `axios.get('/api/users')`
- Template literals — `` axios.post(`/api/users/${id}`) ``
- Object form — `axios({ method: 'patch', url: '/api/orders/42' })`
- Common clients — `axios`, `api`, `http`, `client` (and chained variants like `this.$http`)

**Navigate**

| Action | Result |
|--------|--------|
| **Ctrl+Click** on the URL string (Go to Definition) | Jump to controller |
| **Click** the underlined URL (document link) | Same |
| Ambiguous URL (e.g. `` `/api/${section}/users` ``) | QuickPick lists every matching route — pick one |

Monorepo roots are auto-detected (`artisan` + Vue/Nuxt frontend) up to **3 levels** deep. Routes refresh automatically when you save `routes/`, controllers, or providers (500 ms debounce).

---

## What you need to know

### Requirements

| | |
|---|---|
| VS Code | `^1.85.0` |
| PHP | Optional — `php artisan route:list --json` when available; static parser fallback otherwise |
| Project layout | Laravel backend + Vue (or TS/JS) frontend in the same workspace |

### Settings worth changing

| Setting | Default | When to touch it |
|---------|---------|------------------|
| `laravelVueNavigator.laravelPath` | `auto` | Monorepo layout is non-standard |
| `laravelVueNavigator.frontendPath` | `auto` | Same |
| `laravelVueNavigator.apiBaseUrl` | `""` | Override API prefix (auto-read from `bootstrap/app.php`, usually `/api`) |
| `laravelVueNavigator.phpBinary` | `php` | PHP not on `PATH` |
| `laravelVueNavigator.useArtisan` | `true` | Docker / no local PHP — use static parser only |
| `laravelVueNavigator.ambiguityStrategy` | `pick` | `peek` (native Peek panel) or `first` (silent best match) |
| `laravelVueNavigator.ambiguityScope` | `topScoreOnly` | `allMatches` to include looser fallbacks |
| `laravelVueNavigator.underlineUrls` | `true` | Set `false` to hide URL underlines (Ctrl+Click still works) |

<details>
<summary><strong>All settings</strong></summary>

| Setting | Default | Description |
|---------|---------|-------------|
| `laravelVueNavigator.laravelPath` | `auto` | Workspace-relative Laravel root (`artisan`). |
| `laravelVueNavigator.frontendPath` | `auto` | Workspace-relative frontend root. |
| `laravelVueNavigator.apiBaseUrl` | `""` | API prefix for matching. Empty → read from Laravel `bootstrap/app.php`. |
| `laravelVueNavigator.phpBinary` | `php` | Binary for `artisan route:list --json`. |
| `laravelVueNavigator.useArtisan` | `true` | `false` = static parser only (e.g. Docker without local PHP). |
| `laravelVueNavigator.routeCacheTtl` | `3600` | Disk cache TTL (`.vscode/laravel-vue-navigator.cache.json`). |
| `laravelVueNavigator.refreshDebounceMs` | `500` | Debounce after PHP file saves. |
| `laravelVueNavigator.ambiguityStrategy` | `pick` | `pick` · `peek` · `first` |
| `laravelVueNavigator.ambiguityScope` | `topScoreOnly` | `topScoreOnly` · `allMatches` |
| `laravelVueNavigator.underlineUrls` | `true` | Underline axios URLs as document links. |

</details>

### Commands

- **Laravel-Vue Navigator: Go to controller for endpoint** — cursor on URL
- **Laravel-Vue Navigator: Refresh routes** — force cache rebuild
- **Laravel-Vue Navigator: Show route for endpoint under cursor** — debug match in a notification

### Status bar

`LVN: …` in the bottom-right shows route count and source (`artisan` / `static`). Click to refresh. On failure, **stale cache** is kept (`LVN: stale`) so navigation keeps working until you fix the error.

---

## Not supported (yet)

- Whole URL in a variable — `const u = '/users'; axios.get(u)`
- `fetch`, `ofetch`, `ky`
- Hover preview, reverse navigation (PHP → Vue callers)

---

## Curious how it works?

<details>
<summary><strong>Pipeline (click to expand)</strong></summary>

```
.vue / .ts / .js  →  Babel AST extracts URL + HTTP verb
                  →  Match against route cache (pattern + verb)
                  →  1 match: open controller method
                     N matches: QuickPick / Peek / first (setting)
                  →  PSR-4 resolver → app/Http/Controllers/…
```

**Route cache**

1. **Primary** — `php artisan route:list --json` (middleware, prefixes, resources)
2. **Fallback** — static parse of `routes/*.php` (no PHP required)
3. **Watcher** — `routes/**`, `app/Http/Controllers/**`, `app/Providers/**`

**Ambiguity example**

```ts
axios.get(`/api/${section}/users`);  // pattern → /api/{param}/users
```

Can match `GET /api/dashboard/users` and `GET /api/homepage/users`. Default: QuickPick with full URI + `Controller@method`.

</details>

<details>
<summary><strong>Privacy & security</strong></summary>

Local-only extension — no network, no telemetry. Runs `php artisan` and reads project files on your machine. See [SECURITY.md](SECURITY.md).

</details>

<details>
<summary><strong>Development & contributing</strong></summary>

```bash
npm install && npm run build   # bundle
npm test                       # vitest
# F5 in VS Code to debug
```

- [CONTRIBUTING.md](CONTRIBUTING.md) · [docs/TECHNICAL_OVERVIEW.md](docs/TECHNICAL_OVERVIEW.md) · [docs/QA_CHECKLIST.md](docs/QA_CHECKLIST.md)
- [Report a bug](https://github.com/DanioFiore/laravel-vue-navigator/issues/new/choose)

</details>

---

## License

MIT — [LICENSE](LICENSE) · third-party notices in [NOTICES.md](NOTICES.md)
