# Contributing to Laravel-Vue Navigator

Thank you for your interest in contributing. This project is open source under the
[MIT License](LICENSE).

## Getting started

### Clone the repo

| Who you are | What to do |
|-------------|------------|
| **Collaborator** (push access to this repo) | `git clone` this repository, create a branch, push here, open a PR. **No fork needed.** |
| **Everyone else** | **Fork** on GitHub first, then clone **your fork**. You cannot push branches to someone else's repo without access — the fork is your copy to push to, then you open a PR from fork → upstream. |

Local work is the same in both cases: branch off `main`, commit, push, open a pull request.

1. Clone (directly or from your fork).
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Run tests: `npm test`
5. Lint: `npm run lint`
6. Type-check: `npm run compile`

To debug inside VS Code, press **F5** (Extension Development Host).

## Development workflow

1. Create a branch from `main` with a descriptive name (e.g. `fix/route-matcher-dedup`).
2. Make focused changes with tests when behavior changes.
3. Run `npm test`, `npm run lint`, and `npm run compile` before opening a PR.
4. For user-facing changes, update [README.md](README.md) and [CHANGELOG.md](CHANGELOG.md)
   under an **Unreleased** section (or the next version section if preparing a release).
5. Open a pull request with a clear description of the problem and solution.

## Testing

- **Unit tests:** `npm test` (Vitest)
- **Coverage:** `npm run test:coverage` — enforces thresholds on core `src/services/` modules
- **Manual QA:** before releases, run through [docs/QA_CHECKLIST.md](docs/QA_CHECKLIST.md) on a
  real Laravel + Vue monorepo

Pure logic under `src/services/` should have unit tests. VS Code integration (DefinitionProvider,
QuickPick) is covered by manual QA.

## Code style

- Match existing TypeScript patterns in the repository.
- Keep changes minimal and scoped to the issue at hand.
- Prefer clear names over comments; comment only non-obvious behavior.
- ESLint rules in `.eslintrc.json` apply to `src/`.

## Reporting bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml). Include:

- Extension version and VS Code / Cursor version
- OS
- Relevant settings (`laravelPath`, `apiBaseUrl`, `ambiguityStrategy`, etc.)
- Frontend snippet and expected Laravel route
- Output channel logs from **Laravel-Vue Navigator**

## Feature requests

Open a [feature request](.github/ISSUE_TEMPLATE/feature_request.yml) describing the use case and
why it fits the extension scope. See README **“Not supported (yet)”** for boundaries.

## Security

Do not open public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be respectful and constructive.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
