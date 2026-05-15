# Changelog

## 0.1.0

- Initial release.
- Go-to-definition from axios endpoints in `.vue`, `.ts`, `.js` to Laravel controller methods.
- Hybrid route resolver: `php artisan route:list --json` + static parser fallback.
- File-system watcher with debounce on `routes/**`, `app/Http/Controllers/**`, `app/Providers/**`.
- Stale-on-error cache strategy.
- Auto-detection of Laravel and Vue roots in monorepo workspaces.
- Commands: `Refresh routes`, `Show route for endpoint under cursor`.
