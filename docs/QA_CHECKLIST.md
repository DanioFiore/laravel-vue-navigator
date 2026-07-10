# Laravel-Vue Navigator — Manual QA Checklist

Run on a **real Laravel + Vue/TS monorepo** before publish or tag.

**Version:** __________ · **Date:** __________ · **IDE:** VS Code / Cursor __________ · **OS:** __________

Mark each case: **OK** · **FAIL** · **N/A** — on FAIL, attach output channel log + screenshot.

---

## Setup (once per session)

- [ ] Workspace with Laravel (`artisan`, even in subfolder) + frontend with `axios` calls
- [ ] Extension via **F5**, **local `.vsix`**, or Marketplace
- [ ] Output channel **Laravel-Vue Navigator** shows `Using Laravel root: …`
- [ ] Status bar: `LVN: N routes (artisan)` (or `static`)

**Baseline settings** (override only when a case says so):

```json
{
  "laravelVueNavigator.laravelPath": "auto",
  "laravelVueNavigator.frontendPath": "auto",
  "laravelVueNavigator.apiBaseUrl": "",
  "laravelVueNavigator.useArtisan": true,
  "laravelVueNavigator.ambiguityStrategy": "pick",
  "laravelVueNavigator.ambiguityScope": "topScoreOnly"
}
```

**Test routes** (create temporarily if missing):

| URI | Purpose |
|-----|---------|
| `GET /api/users` | Literal URL |
| `GET /api/users/{id}` | Single param |
| `GET /api/template/users` + `GET /api/route_book/users` | Ambiguity (same `{param}` shape) |
| `GET /api/qa-smoke-test` | Watcher smoke |

**Gestures**

| OS | Go to Definition | Document link |
|----|------------------|---------------|
| macOS | Cmd+Click **on URL string** | Click underlined URL |
| Win/Linux | Ctrl+Click **on URL string** | Click underlined URL |

Click must be on the URL argument — not on `axios`, `api`, or `params`.

---

## Release smoke (~10 min)

Run **every** release:

| # | ID | Steps | Expected | OK |
|---|-----|-------|----------|-----|
| 1 | **N-01** | `axios.get('/api/users')` → Ctrl+Click URL | Opens correct controller method, no QuickPick | |
| 2 | **N-20** | `` axios.get(`/api/${section}/users`) `` with 2 matching routes | QuickPick ≥2 items → pick opens correct PHP | |
| 3 | **N-40** | Open QuickPick → **Escape** | Closes, no navigation | |
| 4 | **W-01+02** | Add `GET /api/qa-smoke-test`, save, `axios.get(...)` → click | Route appears in cache, navigation works | |
| 5 | **R-01** | Command *Refresh routes* | Status `LVN: N routes (artisan)`, notification with count | |

---

## Navigation

| ID | Steps | Expected | OK | Notes |
|----|-------|----------|-----|-------|
| **N-01** | Literal `axios.get('/api/users')` — Ctrl+Click | Direct jump to method | | |
| **N-02** | Same with `api` / `http` / `client` wrapper | Same as N-01 | | |
| **N-03** | `axios({ method: 'get', url: '…' })` — click `url` | Verb + URL extracted | | |
| **N-04** | URL with `?query=1` | Match on path only | | |
| **N-05** | Click **underlined** URL (document link) | Same destination as Ctrl+Click | | |
| **N-10** | `` `/api/users/${id}` `` | Jump or QuickPick if tied scores | | |
| **N-20** | Ambiguous `` `/api/${x}/users` `` | QuickPick: URI + `Controller@method` + file path | | |
| **N-21** | Pick first QuickPick item | Correct PHP opens | | |
| **N-22** | Pick second item | Different controller (if routes differ) | | |
| **N-30** | `` `/api/${a}/${b}` `` (2 vars) | QuickPick with compatible routes | | |
| **N-40** | QuickPick → Escape | No navigation | | |
| **N-41** | QuickPick → click outside | No navigation | | |
| **N-50** | Ctrl+Click on `axios` name | No navigation | | |
| **N-51** | Ctrl+Click on `params: {…}` | No navigation | | |
| **N-60** | `.vue` `<script setup lang="ts">` | Works | | |
| **N-62** | Cursor in `<template>` / `<style>` | No navigation | | |

---

## Ambiguity settings

Reload window after changing settings.

| ID | Settings | Steps | Expected | OK |
|----|----------|-------|----------|-----|
| **A-01** | `pick` (default) | N-20 | QuickPick | |
| **A-02** | `peek` | N-20 Ctrl+Click | Native Peek panel (no custom QuickPick) | |
| **A-03** | `first` | N-20 Ctrl+Click | Silent jump to best match | |
| **A-10** | `topScoreOnly` | URL matching specific + catch-all routes | Only top-score tier in list | |
| **A-11** | `allMatches` | Same URL | Includes looser routes | |

---

## Configuration

| ID | Steps | Expected | OK |
|----|-------|----------|-----|
| **C-01** | `artisan` in subfolder → `"laravelPath": "backend"` | Routes load, navigation works | |
| **C-02** | Wrong `laravelPath` | No crash; no routes | |
| **C-10** | Frontend `axios.get('/users')`, Laravel route `/api/users`, `"apiBaseUrl": "/api"` | Match + jump | |
| **C-11** | Frontend already `/api/users` + `apiBaseUrl: "/api"` | No double-prefix bug | |
| **C-20** | Custom `"phpBinary"` path | `LVN: … (artisan)` | |

---

## Route cache

| ID | Steps | Expected | OK |
|----|-------|----------|-----|
| **R-01** | `useArtisan: true`, Refresh | `(artisan)` in status bar | |
| **R-10** | `useArtisan: false`, Refresh | `(static)` | |
| **R-11** | Static mode, simple `Route::get` in `api.php` | Navigation OK | |
| **R-20** | Introduce PHP **syntax error** in routes file, save | `LVN: stale (N)`; old routes still navigable | |
| **R-21** | Fix error, save | Back to `(artisan)` or `(static)` | |

---

## Watcher (`refreshDebounceMs: 500`)

| ID | Steps | Expected | OK |
|----|-------|----------|-----|
| **W-01** | Save new route in `routes/api.php` | Refresh within ~0.5–2s | |
| **W-02** | Navigate to new route | Jump OK | |
| **W-03** | Save controller file only | Refresh fires (conservative) | |
| **W-04** | Save 3 PHP files &lt;500ms apart | Single debounced refresh | |

---

## Commands & diagnostics

| ID | Steps | Expected | OK |
|----|-------|----------|-----|
| **D-01** | *Show route for endpoint under cursor* on known URL | Notification: method, URI, action | |
| **D-02** | Same command, line without axios | "no endpoint detected" | |
| **D-03** | URL with no Laravel match | Warning | |
| **D-04** | Click status bar `LVN: …` | Refreshes routes | |
| **D-05** | *Go to controller for endpoint* (palette) | Same as Ctrl+Click on URL | |
| **D-06** | Ambiguous case — output channel | `Ambiguous endpoint '…': N candidate routes -> strategy=…` | |

---

## Known limits (expected, not bugs)

| ID | Steps | Expected | OK |
|----|-------|----------|-----|
| **L-01** | `const u = '/api/users'; axios.get(u)` | No navigation | |
| **L-02** | Route with `Closure` only | No destination | |
| **L-03** | `fetch('/api/users')` | No integration | |
| **L-04** | No `artisan` + bad `laravelPath` | Idle, no crash | |

---

## Optional matrix (full pre-release)

| Environment | N-01 | N-20 | N-40 | W-02 |
|-------------|------|------|------|------|
| VS Code macOS | | | | |
| VS Code Windows | | | | |
| Cursor | | | | |
| Static only (R-10) | | | | |
| Manual `laravelPath` (C-01) | | | | |

---

## Bug report template

```
Case ID:
Extension version:
IDE / OS:
Settings (laravelPath, apiBaseUrl, ambiguityStrategy):
Frontend snippet:
Expected Laravel routes:
Expected vs observed:
Output channel (last lines):
Screenshot:
```

---

## References

- [README](../README.md) — user docs
- [TECHNICAL_OVERVIEW.md](./TECHNICAL_OVERVIEW.md) — architecture
- Automated: `npm test` · `npm run test:coverage`

*Aligned with v0.1.6 — DefinitionProvider, DocumentLinkProvider, QuickPick disambiguation, stale cache.*
