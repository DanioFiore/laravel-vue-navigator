# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-05-18

### Added

- **Ambiguous endpoint disambiguation:** when a template literal or dynamic URL segment
  (e.g. `` `/api/${apiVersion}/${route}` ``) matches more than one Laravel route, the
  extension can surface every candidate instead of picking one silently.
- `matchRoutes()` in `routeMatcher` — returns all matching routes sorted by specificity
  score (used by the definition provider and ambiguity pipeline).
- `ambiguityResolver` module — `filterCandidatesByScope()` and `formatQuickPickEntry()`
  for QuickPick labels (full URI, controller action, PHP file path).
- Settings:
  - `laravelVueNavigator.ambiguityStrategy` — `pick` (default), `peek`, or `first`.
  - `laravelVueNavigator.ambiguityScope` — `topScoreOnly` (default) or `allMatches`.
- Output channel log when ambiguity is detected (endpoint pattern, verb, candidate count,
  active strategy).
- [Manual QA checklist](docs/QA_CHECKLIST.md) for pre-release testing on real monorepos.
- `npm run test:coverage` — Vitest coverage with thresholds on core `src/services/` modules
  (≥75% lines; providers and VS Code integration excluded, covered by manual QA).

### Fixed

- **QuickPick navigation:** selecting a route from the disambiguation popup now opens the
  correct PHP controller via `window.showTextDocument`. Returning a `Location` from
  `provideDefinition` after awaiting `showQuickPick` was ignored by VS Code once the
  picker had taken focus.

### Changed

- `matchRoute()` is now a thin wrapper over `matchRoutes()[0]` (behaviour preserved for
  single-match cases).
- `AxiosDefinitionProvider` branches on candidate count and configured ambiguity
  strategy before resolving the controller file.

## [0.1.0] - 2025-05-11

### Added

- Initial release.
- Go-to-definition from axios endpoints in `.vue`, `.ts`, `.js` to Laravel controller methods.
- Hybrid route resolver: `php artisan route:list --json` + static parser fallback.
- File-system watcher with debounce on `routes/**`, `app/Http/Controllers/**`, `app/Providers/**`.
- Stale-on-error cache strategy.
- Auto-detection of Laravel and Vue roots in monorepo workspaces.
- Commands: `Refresh routes`, `Show route for endpoint under cursor`.

[0.1.1]: https://github.com/DanioFiore/laravel-vue-navigator/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/DanioFiore/laravel-vue-navigator/releases/tag/v0.1.0
