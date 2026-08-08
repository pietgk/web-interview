import { defineConfig } from 'vitest/config'

// One Vitest process for everything that runs in Node or happy-dom. Each project
// keeps its own config so it resolves its own dependencies from its own
// node_modules - this repo installs per workspace, not through npm workspaces.
//
// The `storybook` project is deliberately NOT listed here. It runs in real
// Chromium via `frontend/vitest.storybook.config.js`, launched from `frontend/`
// by `verify browser`. Under this root process its browser provider and runner
// resolve through different installs, and the run stalls partway through the
// story files. See ADR 006.
// Only non-UI seams are gated. Components are judged by story states, play
// functions, and a11y - never by a line percentage on JSX (ADR 005, ADR 006).
//
// The rule is the file extension: **`.js` is logic and is gated, `.jsx` is a
// component and is not.** Globs rather than a file list, so a new logic file is
// gated the day it is written instead of the day someone remembers to add it.
const GATED_SEAMS = [
  'shared/src/**/*.js',
  'backend/src/**/*.js',
  'frontend/src/todos/**/*.js',
  'frontend/src/testing/*.js',
]

export default defineConfig({
  test: {
    projects: [
      './shared/vitest.config.js',
      './backend/vitest.config.js',
      './frontend/vitest.logic.config.js',
      './scripts/vitest.config.js',
    ],
    coverage: {
      provider: 'v8',
      include: GATED_SEAMS,
      exclude: [
        '**/*.test.js',
        '**/*.spec.js',
        // Pure JSDoc typedefs - no runtime code exists to execute.
        '**/shared/src/types.js',
        // Process bootstrap. e2e proves it, in a process v8 cannot see from here.
        '**/backend/src/index.js',
      ],
      // AST remapping can reveal original test and JSX sources after the first
      // include pass. Reapply the logic-only contract to those source paths.
      excludeAfterRemap: true,
      // Vitest 4's V8 provider always uses AST-aware remapping, so non-runtime
      // comments and empty lines are excluded without the removed legacy hack.
      // `html` keeps Istanbul's line-level explorer. The canonical evidence
      // landing page is generated separately at coverage/report.html.
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
    },
  },
})
