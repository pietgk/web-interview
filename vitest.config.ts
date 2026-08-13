import { defineConfig } from 'vitest/config'
import { COVERAGE_PROVIDER } from './scripts/coverage-producers.ts'

// One Vitest process for everything that runs in Node. Each project
// keeps its own config so it resolves its own dependencies from its own
// node_modules - this repo installs per workspace, not through npm workspaces.
//
// The `storybook` project is deliberately NOT listed here. It runs in real
// Chromium via `frontend/vitest.storybook.config.ts`, launched from `frontend/`
// by `verify browser`. Under this root process its browser provider and runner
// resolve through different installs, and the run stalls partway through the
// story files. See ADR 006.
// This is collection scope, not semantic ownership. The explicit registry in
// scripts/source-evidence-registry.ts decides which files compare with the
// Node owner baseline. Broad collection retains useful overlap for the optional
// automation view without letting that overlap rescue an owner verdict.
const NODE_COVERAGE_COLLECTION = [
  'shared/src/**/*.js',
  'backend/src/**/*.js',
  'frontend/src/todos/**/*.js',
  'frontend/src/testing/*.js',
]

export default defineConfig({
  test: {
    projects: [
      './shared/vitest.config.ts',
      './backend/vitest.config.ts',
      './frontend/vitest.logic.config.ts',
      './scripts/vitest.config.ts',
    ],
    coverage: {
      provider: COVERAGE_PROVIDER.name,
      include: NODE_COVERAGE_COLLECTION,
      exclude: [
        '**/*.test.js',
        '**/*.spec.js',
        // Pure JSDoc typedefs - no runtime code exists to execute.
        '**/shared/src/types.js',
        // Process bootstrap. e2e proves it, in a process v8 cannot see from here.
        '**/backend/src/index.js',
      ],
      // AST remapping can reveal original test and JSX sources after the first
      // include pass. Reapply collection scope to those source paths.
      excludeAfterRemap: true,
      // `html` keeps Istanbul's line-level explorer. The canonical evidence
      // landing page is generated separately at coverage/report.html.
      reporter: ['text', 'json-summary', 'json', 'html'],
      reportsDirectory: '.coverage-reports/node',
    },
  },
})
