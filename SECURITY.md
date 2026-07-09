# Security Policy

## Supported versions

Security fixes are provided for the latest release published on the
[VS Code Marketplace](https://marketplace.visualstudio.com/) and the latest commit on the `main`
branch.

| Version | Supported |
| ------- | --------- |
| Latest  | Yes       |
| Older   | Best effort |

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security issue, report it privately:

1. Open a [GitHub Security Advisory](https://github.com/DanioFiore/laravel-vue-navigator/security/advisories/new)
   (preferred), **or**
2. Email the maintainer via the contact address on their GitHub profile.

Include:

- Description of the vulnerability and impact
- Steps to reproduce
- Affected versions
- Suggested fix (if any)

You should receive an acknowledgment within a reasonable time. We will work with you on a fix and
coordinate disclosure.

## Scope

Laravel-Vue Navigator is a **local-only** VS Code extension. It does not make outbound network
requests at runtime and does not collect telemetry. See the README **Privacy and security** section
for what runs on your machine.

Typical concerns:

- **Command injection:** the extension spawns `php` with fixed arguments (`artisan route:list --json`).
  The PHP binary path is user-configurable — use a trusted path.
- **Path traversal:** route and controller resolution should stay within the configured Laravel root.
  Report any way to escape the workspace or Laravel project directory.
- **Secrets in the repository:** never commit `.env`, tokens, or keys. Report accidental exposure.

## Safe defaults

- Do not commit secrets; `.gitignore` blocks common patterns.
- Before each release, maintainers verify no sensitive filenames are tracked (see README).
