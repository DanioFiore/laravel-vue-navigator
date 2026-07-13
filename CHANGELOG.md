# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0](https://github.com/DanioFiore/laravel-vue-navigator/compare/v0.1.8...v0.2.0)

### Added

- **Static route parser** — Support for `Route::resources()` and `Route::apiResources()` array syntax. Each entry is expanded into the standard Laravel resource routes (`index`, `create`, `store`, `show`, `edit`, `update`, `destroy`; API resources omit `create` and `edit`).
- **Nested and multi-segment resources** — Resource keys with path parameters or multiple segments (e.g. `posts/{post_id}/reviews`, `admin/items/attachments`) are expanded correctly in static parsing mode.
- **Resource wildcard parameters** — Static expansion derives the `{parameter}` name from the last URI segment (Laravel-style singularization) instead of always using `{id}`.

### Changed

- **`Route::resource()` / `Route::apiResource()`** — Single-resource calls now use the same parameter derivation logic as `Route::resources()`.

## [0.1.8](https://github.com/DanioFiore/laravel-vue-navigator/compare/v0.1.7...v0.1.8)

CI workflow and branding updates. No runtime behaviour changes.

### Changed

- **.github/workflows/ci.yml** — Improved CI workflow with release automation for Visual Studio Marketplace and Open VSX publishing.
- **Logo** — Updated extension icon for clearer Marketplace presentation.

## [0.1.7](https://github.com/DanioFiore/laravel-vue-navigator/compare/v0.1.6...v0.1.7)

Documentation and Marketplace metadata refresh. No runtime behaviour changes.

### Changed

- **README.md** — Restructured for Marketplace scanning: problem → solution → essentials → optional deep-dive. Document links and Ctrl+Click documented side by side. Advanced topics (pipeline, privacy, development) moved into collapsible sections.
- **docs/TECHNICAL_OVERVIEW.md** — Rewritten and shortened; corrected architecture references (`navigationService`, `AxiosDocumentLinkProvider`, `goToController`). Documented `peek` vs document-link behaviour.
- **docs/QA_CHECKLIST.md** — Condensed manual QA flow; added smoke-test block, document-link cases (`N-05`, `D-05`), and alignment with current commands and status bar states.
- **CONTRIBUTING.md** — Clarified when a GitHub fork is required (external contributors) vs direct clone + branch (collaborators with push access).
- **package.json** — Updated Marketplace `description` and `keywords`; corrected `apiBaseUrl` setting description; shorter configuration copy; command palette grouping via `category`.

