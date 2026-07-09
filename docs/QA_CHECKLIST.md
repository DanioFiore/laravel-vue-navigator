# Laravel-Vue Navigator — Manual QA Checklist

Repeatable checklist to validate the extension on a **real monorepo** (Laravel + Vue/TS) before
publishing to the Marketplace or cutting a release.

**Extension version under test:** _______________  
**Date:** _______________  
**Tester:** _______________  
**IDE:** VS Code / Cursor — version _______________  
**OS:** _______________

---

## How to use this document

1. Fill in the **Setup** section once per test session.
2. Run cases in the suggested order (basic flows first, then edge cases).
3. For each row mark: **OK** | **FAIL** | **N/A** (not applicable) and add notes.
4. On **FAIL**, attach: screenshot, output channel log line, file path used.

Table column legend:

| Column | Meaning |
|--------|---------|
| **ID** | Case identifier |
| **Steps** | What to do |
| **Expected** | Correct behavior |
| **Result** | OK / FAIL / N/A |
| **Notes** | Observations, issue link |

---

## 1. Prerequisites

### 1.1 Test environment

- [ ] Workspace open with **at least** one Laravel project (`artisan` present, even in a subfolder).
- [ ] Vue or TS/JS frontend with `axios` calls (or `api` / `http` / `client` wrappers).
- [ ] PHP available on PATH **or** dedicated test with `useArtisan: false` (see section 7).
- [ ] Extension installed via:
  - [ ] **Extension Development Host** (F5 from the extension repo), or
  - [ ] **Local `.vsix`** (`npm run package` → *Install from VSIX*), or
  - [ ] **Marketplace** (post-publish smoke test).

### 1.2 Activation check

- [ ] Open a frontend `.vue`, `.ts`, or `.js` file.
- [ ] Output channel **"Laravel-Vue Navigator"** visible (*View → Output* → select the channel).
- [ ] Initial log contains a line like `Using Laravel root: ...` (if `artisan` was found).
- [ ] Status bar bottom-right shows an **LVN:** item (e.g. `LVN: N routes (artisan)`).

If the extension stays idle without a Laravel root log:

- Set `laravelVueNavigator.laravelPath` manually (see case **C-01**).
- Verify `artisan` exists at the configured path.

### 1.3 Recommended settings for a "standard" session

Use these as baseline; specific cases override where noted.

```json
{
  "laravelVueNavigator.laravelPath": "auto",
  "laravelVueNavigator.frontendPath": "auto",
  "laravelVueNavigator.apiBaseUrl": "",
  "laravelVueNavigator.phpBinary": "php",
  "laravelVueNavigator.useArtisan": true,
  "laravelVueNavigator.routeCacheTtl": 3600,
  "laravelVueNavigator.refreshDebounceMs": 500,
  "laravelVueNavigator.ambiguityStrategy": "pick",
  "laravelVueNavigator.ambiguityScope": "topScoreOnly"
}
```

### 1.4 Backend preparation (test routes)

On the Laravel project, ensure you have (or temporarily create) routes useful for testing:

| Route URI (example) | Method | Test purpose |
|---------------------|--------|--------------|
| `/api/users` | GET | Literal URL |
| `/api/users/{id}` | GET | Single parameter |
| `/api/template/users` | GET | Multi-segment ambiguity |
| `/api/route_book/users` | GET | Second ambiguous route (same structural pattern) |
| `/api/{version}/orders` | GET | Two dynamic segments (or equivalent routes in your project) |
| `/api/qa-smoke-test` | GET | New route for watcher test (case **W-01**) |

Note the real controllers linked to these routes — you will need them to verify the correct PHP file opens.

---

## 2. Quick UI reference

### 2.1 Navigation gesture

- **macOS:** Cmd + Click on the **URL** (string or template literal).
- **Windows / Linux:** Ctrl + Click on the **URL**.

The click must land on the URL argument of the axios call, **not** on:

- the `axios` / `api` name;
- the `params`, `headers`, etc. object;
- variables outside the URL.

### 2.2 Command palette

| Command | QA use |
|---------|--------|
| `Laravel-Vue Navigator: Refresh routes` | Force route cache refresh |
| `Laravel-Vue Navigator: Show route for endpoint under cursor` | Debug: notification with matched route (does not open file) |

### 2.3 Status bar (`LVN` item)

| Text (approx.) | Meaning |
|----------------|---------|
| `LVN: ready` | Startup, waiting |
| `$(sync~spin) LVN: refreshing` | Refresh in progress |
| `LVN: N routes (artisan)` | Cache updated via Artisan |
| `LVN: N routes (static)` | Cache from static parser |
| `$(warning) LVN: stale (N)` | Refresh failed, previous cache still used — **click to retry** |
| `LVN: no routes` | No routes in cache |

### 2.4 Output channel

On FAIL, copy the last lines from **Laravel-Vue Navigator**, especially:

- `Using Laravel root: ...`
- `Ambiguous endpoint '...' (VERB): N candidate routes -> strategy=...`
- `ERROR: ...`
- `Using stale cache (N routes)`

---

## 3. Functional cases — Navigation (Go to Definition)

Run with `ambiguityStrategy: pick` and `ambiguityScope: topScoreOnly` unless noted otherwise.

### 3.1 Literal URL

| ID | Steps | Expected | Result | Notes |
|----|-------|----------|--------|-------|
| **N-01** | In a `.vue`/`.ts`, `axios.get('/api/users')` (or an existing real path). Ctrl+Click on `'/api/users'`. | No QuickPick. Correct PHP controller opens, cursor on method (e.g. `index`). | | |
| **N-02** | Same test with `api.get(...)` or `http`/`client` wrapper if used in the project. | Same behavior as N-01. | | |
| **N-03** | `axios({ method: 'get', url: '/api/users' })`. Click on the `url` string. | Pattern and verb extracted; navigation as N-01. | | |
| **N-04** | URL with query: `axios.get('/api/users?active=1')`. | Match on path without query; navigation OK. | | |

### 3.2 Template literal — one parameter

| ID | Steps | Expected | Result | Notes |
|----|-------|----------|--------|-------|
| **N-10** | `` axios.get(`/api/users/${id}`) `` with at least two matching Laravel routes (e.g. list + detail). | If **one** best match → direct jump. If **multiple** ties at same specificity → QuickPick (see N-20). | | |
| **N-11** | Click on static segment of template (e.g. `/api/users`) not on `${id}`. | Consistent behavior (extraction from call expression containing cursor). | | |

### 3.3 Template literal — ambiguity (QuickPick)

Prepare two Laravel routes with the same "shape" but different literal segments, e.g.:

- `GET /api/template/users`
- `GET /api/route_book/users`

Frontend:

```ts
const section = 'template'; // value irrelevant to the parser
axios.get(`/api/${section}/users`);
```

| ID | Steps | Expected | Result | Notes |
|----|-------|----------|--------|-------|
| **N-20** | Ctrl+Click on the template URL. | **QuickPick** opens with title *"Laravel-Vue Navigator: choose a route"* and ≥2 items. Each item: `GET /full/uri`, description `Controller@method`, detail relative PHP path. | | |
| **N-21** | From QuickPick, select the first item (click or Enter). | Chosen controller `.php` file opens; cursor on `function ...` line. | | |
| **N-22** | Repeat N-20 and select the **second** item. | **Other** controller opens (not the same file as item 1, unless both point to the same file). | | |

### 3.4 Template literal — two or more variables

Real-world example:

```ts
let route = 'orders';
const res = await axios.get(`/api/${apiVersion}/${route}`, {
  params: { page: 1 }
});
```

| ID | Steps | Expected | Result | Notes |
|----|-------|----------|--------|-------|
| **N-30** | Ctrl+Click on the URL (template literal). | QuickPick with all Laravel routes compatible with pattern like `/api/{param}/{param}` (or equivalent in your project). | | |
| **N-31** | Select an item from QuickPick. | PHP file + correct method open (**regression fix for `showTextDocument`**). | | |

### 3.5 Close QuickPick without navigating

| ID | Steps | Expected | Result | Notes |
|----|-------|----------|--------|-------|
| **N-40** | Open QuickPick (ambiguous case). Press **Escape**. | Popup closed. **No** PHP file opened. No error in output. | | |
| **N-41** | Open QuickPick. **Click outside** (editor, explorer, another panel). | Popup closed. No navigation. | | |
| **N-42** | Open QuickPick. Switch **tab/editor** (open another file) without choosing. | Popup closed or request cancelled. No crash; no spurious navigation. | | |

### 3.6 Click outside the URL

| ID | Steps | Expected | Result | Notes |
|----|-------|----------|--------|-------|
| **N-50** | Ctrl+Click on `axios` (function name, not URL). | No navigation (standard VS Code behavior / no definition). | | |
| **N-51** | Ctrl+Click on `params: { ... }` in `axios.get(url, { params })`. | No navigation to Laravel controller. | | |

### 3.7 Vue files

| ID | Steps | Expected | Result | Notes |
|----|-------|----------|--------|-------|
| **N-60** | Same N-01 test inside `<script setup lang="ts">` of a `.vue` file. | Navigation OK (parser extracts script block only). | | |
| **N-61** | Click on URL in `<script lang="js">` if present in the project. | Navigation OK. | | |
| **N-62** | Click with cursor in `<template>` or `<style>` (not in script). | No navigation (no script at position). | | |

---

## 4. Ambiguity strategies (`ambiguityStrategy` / `ambiguityScope`)

Repeat at least one ambiguous case (e.g. N-20) with different settings. **Reload window** or reopen
files if settings do not apply immediately.

### 4.1 `ambiguityStrategy`

| ID | Setting | Steps | Expected | Result | Notes |
|----|---------|-------|----------|--------|-------|
| **A-01** | `pick` (default) | Case N-20 / N-30. | QuickPick → selection → `showTextDocument` on PHP. | | |
| **A-02** | `peek` | Same ambiguous URL, Ctrl+Click. | VS Code opens **Peek Definition** with multiple targets (code snippets). No custom QuickPick. | | |
| **A-03** | `first` | Same ambiguous URL, Ctrl+Click. | **Immediate** navigation to first/best match **without** popup. | | Verify order is not arbitrary when two routes share the same score. |

### 4.2 `ambiguityScope`

Requires a URL that matches both specific routes and a possible catch-all (e.g. `/api/{any}/users`).

| ID | Setting | Steps | Expected | Result | Notes |
|----|---------|-------|----------|--------|-------|
| **A-10** | `topScoreOnly` | QuickPick on ambiguous URL. | Only routes with **maximum score** (no less specific catch-alls when more specific matches exist). | | |
| **A-11** | `allMatches` | Same URL. | QuickPick includes **also** less specific routes (e.g. catch-all), sorted by descending score. | | |

---

## 5. Configuration and monorepo

### 5.1 Manual Laravel path

| ID | Steps | Expected | Result | Notes |
|----|-------|----------|--------|-------|
| **C-01** | Workspace **without** `artisan` at root (only in subfolder, e.g. `backend/`). Set `"laravelVueNavigator.laravelPath": "backend"`. Restart or reload window. | Log: `Using Laravel root: .../backend`. Status bar with N routes > 0. Ctrl+Click works. | | |
| **C-02** | Wrong path (`"laravelPath": "does/not/exist"`). | Extension idle or no routes; clear log. No IDE crash. | | |

### 5.2 `apiBaseUrl`

| ID | Steps | Expected | Result | Notes |
|----|-------|----------|--------|-------|
| **C-10** | Laravel: route registered as `/api/users`. Frontend: `axios.get('/users')` **without** `/api`. Setting `"apiBaseUrl": "/api"`. | Match on `/api/users`; navigation to correct controller. | | |
| **C-11** | Frontend already uses `/api/users` with `apiBaseUrl: "/api"`. | No erroneous double prefix; match still correct. | | |

### 5.3 `phpBinary`

| ID | Steps | Expected | Result | Notes |
|----|-------|----------|--------|-------|
| **C-20** | If PHP is not on PATH (e.g. MAMP, Valet), set `"phpBinary": "/full/path/to/php"`. Refresh routes. | Status `(... artisan)`, routes updated. | | |

---

## 6. Route resolution (Artisan vs static vs stale)

### 6.1 Artisan (default)

| ID | Steps | Expected | Result | Notes |
|----|-------|----------|--------|-------|
| **R-01** | `useArtisan: true`, working PHP. *Refresh routes* command. | Status: `LVN: N routes (artisan)`. Notification with route count. | | |
| **R-02** | Compare a known route with terminal output: `php artisan route:list` in `laravelRoot`. | URI and controller consistent with the extension. | | |

### 6.2 Static parser (without PHP)

| ID | Steps | Expected | Result | Notes |
|----|-------|----------|--------|-------|
| **R-10** | `"laravelVueNavigator.useArtisan": false`. Refresh. | Status: `LVN: N routes (static)`. | | |
| **R-11** | Ctrl+Click on route defined in `routes/api.php` (simple `Route::get(...)` syntax). | Navigation OK. | | |
| **R-12** | (Optional) Route registered **only** in ServiceProvider with complex conditional logic. | May **not** appear — known limitation; mark N/A or expected FAIL. | | |

### 6.3 Stale cache (PHP error)

| ID | Steps | Expected | Result | Notes |
|----|-------|----------|--------|-------|
| **R-20** | With cache already populated, introduce a **syntax error** in `routes/web.php` or `api.php` and save. | Status: `LVN: stale (N)`. Tooltip invites retry. Ctrl+Click **still** works on old cached routes. | | |
| **R-21** | Fix syntax error and save. | After debounce, status returns to `(artisan)` or `(static)` with updated N. | | |

---

## 7. File watcher and automatic refresh

Default `refreshDebounceMs: 500`.

| ID | Steps | Expected | Result | Notes |
|----|-------|----------|--------|-------|
| **W-01** | Add to `routes/api.php`: `Route::get('/api/qa-smoke-test', [TestController::class, 'index']);` (or existing closure/controller). **Save**. | Within ~0.5–2 s: status goes from refreshing to OK; route count increases by 1 (or refresh log). | | |
| **W-02** | In frontend call `axios.get('/api/qa-smoke-test')` and Ctrl+Click. | Navigation to new action. | | |
| **W-03** | Modify **only** a file in `app/Http/Controllers/...` (refactor method name, same URI). Save. | Refresh fires (conservative); navigation still points to method if URI unchanged. | | |
| **W-04** | Save **three** PHP files quickly in sequence (< 500 ms apart). | Single effective refresh (debounce), not three blocking spins. | | |

---

## 8. Commands and diagnostics

| ID | Steps | Expected | Result | Notes |
|----|-------|----------|--------|-------|
| **D-01** | Cursor on known URL → *Show route for endpoint under cursor*. | Notification with HTTP method, URI, and action (e.g. `GET api/users -> Controller@method`). | | |
| **D-02** | Cursor on line without axios. | Message: no endpoint detected. | | |
| **D-03** | URL with no Laravel match. | Warning: no route matched. | | |
| **D-04** | Click status bar item `LVN: ...`. | Runs refresh routes (same as command palette). | | |
| **D-05** | Ambiguous case N-20: check output channel. | Log line: `Ambiguous endpoint '...' (...): N candidate routes -> strategy=pick`. | | |

---

## 9. Negative cases and known limits

Documented as **expected** behavior, not bugs.

| ID | Steps | Expected | Result | Notes |
|----|-------|----------|--------|-------|
| **L-01** | `const url = '/api/users'; axios.get(url);` — click on variable `url`. | **No** navigation (URL not inline literal). | | v0.1 limit |
| **L-02** | Laravel route with `Closure` action and no controller. | No destination (provider returns undefined). | | |
| **L-03** | `fetch('/api/users')` instead of axios. | No integration. | | |
| **L-04** | Workspace without `artisan` and wrong `laravelPath`. | Extension does not navigate; no crash. | | |

---

## 10. Release regression (minimum smoke test)

Run **always** before every tag / publish. Estimated time: 10–15 minutes.

| # | Case ID | Short description | Result |
|---|---------|-------------------|--------|
| 1 | N-01 | Literal URL → PHP | |
| 2 | N-31 | Template 2+ variables → QuickPick → PHP | |
| 3 | N-40 | Escape → no navigation | |
| 4 | W-01 + W-02 | New route saved → navigable | |
| 5 | R-01 | Refresh routes artisan OK | |

---

## 11. Environment matrix (optional, full pre-release)

| Environment | N-01 | N-31 | N-40 | W-02 | Notes |
|-------------|------|------|------|------|-------|
| VS Code + macOS | | | | | |
| VS Code + Windows | | | | | |
| Cursor + macOS | | | | | |
| Monorepo manual path (C-01) | | | | | |
| Static parser only (R-10) | | | | | |

---

## 12. Bug report template

Copy and fill in on FAIL:

```
**Case ID:** N-31
**Extension version:**
**VS Code / Cursor:**
**OS:**
**laravelPath / apiBaseUrl / ambiguityStrategy:**
**Frontend snippet:**
**Expected Laravel routes:**
**Expected behavior:**
**Observed behavior:**
**Output channel logs:**
**Screenshot:** (attach)
```

---

## 13. References

- [README](../README.md) — user-facing features and settings
- [TECHNICAL_OVERVIEW.md](./TECHNICAL_OVERVIEW.md) — internal architecture
- [CHANGELOG](../CHANGELOG.md) — versions and release notes

---

*Last updated: aligned with v0.1.1 (QuickPick disambiguation, `showTextDocument`, `ambiguityStrategy` / `ambiguityScope` settings). Automated suite: unit tests via `npm test`; `npm run test:coverage` for thresholds on `src/services/`.*
