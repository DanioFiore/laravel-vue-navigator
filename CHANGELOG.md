# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.17](https://github.com/DanioFiore/laravel-vue-navigator/compare/v0.1.6...v0.1.17) 

Documentation and Marketplace metadata refresh. No runtime behaviour changes.

### Changed

- **README.md** — Restructured for Marketplace scanning: problem → solution → essentials → optional deep-dive. Document links and Ctrl+Click documented side by side. Advanced topics (pipeline, privacy, development) moved into collapsible sections.
- **docs/TECHNICAL_OVERVIEW.md** — Rewritten and shortened; corrected architecture references (`navigationService`, `AxiosDocumentLinkProvider`, `goToController`). Documented `peek` vs document-link behaviour.
- **docs/QA_CHECKLIST.md** — Condensed manual QA flow; added smoke-test block, document-link cases (`N-05`, `D-05`), and alignment with current commands and status bar states.
- **CONTRIBUTING.md** — Clarified when a GitHub fork is required (external contributors) vs direct clone + branch (collaborators with push access).
- **package.json** — Updated Marketplace `description` and `keywords`; corrected `apiBaseUrl` setting description; shorter configuration copy; command palette grouping via `category`.

