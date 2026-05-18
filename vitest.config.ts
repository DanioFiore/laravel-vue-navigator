import { defineConfig } from 'vitest/config';

/**
 * Coverage thresholds apply to pure/testable modules under `src/services/`.
 * Excluded from enforcement (VS Code / process integration — covered by manual QA):
 * - `src/providers/**` (DefinitionProvider + QuickPick)
 * - `routeResolver/index.ts`, `routeCache.ts`, `routeWatcher.ts`
 * - `extension.ts`, `src/utils/config.ts`, `logger.ts`, `workspaceDetector.ts`
 */
const COVERAGE_INCLUDE = [
  'src/services/routeMatcher.ts',
  'src/services/ambiguityResolver.ts',
  'src/services/controllerLocator.ts',
  'src/services/axiosParser/**/*.ts',
  'src/services/routeResolver/artisanProvider.ts',
  'src/services/routeResolver/staticParser.ts'
];

export default defineConfig({
  test: {
    include: ['src/test/unit/**/*.test.ts'],
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: COVERAGE_INCLUDE,
      exclude: ['src/test/**'],
      thresholds: {
        lines: 75,
        functions: 75,
        statements: 75,
        // Parsers (urlExtractor, staticParser, vueScript) have many defensive branches;
        // line coverage is the primary gate (~80% overall).
        branches: 58
      }
    }
  }
});
