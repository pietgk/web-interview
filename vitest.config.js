import { defineConfig } from 'vitest/config'

// One Vitest process for everything that runs in Node or happy-dom. Each project
// keeps its own config so it resolves its own dependencies from its own
// node_modules - this repo installs per workspace, not through npm workspaces.
//
// The `storybook` project is deliberately NOT listed here. It runs in real
// Chromium via `frontend/vitest.storybook.config.js`, launched from `frontend/`
// by `verify browser`. Under this root process it resolves frontend's copy of
// @vitest/browser while the runner is root's copy, and the run stalls partway
// through the story files. See ADR 006.
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
      './frontend/vitest.config.js',
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
      // Without this, v8 counts comment lines inside an uncovered region as
      // uncovered statements, so explaining why a branch is unreachable makes
      // the number worse. This codebase comments heavily; the distortion is real.
      ignoreEmptyLines: true,
      // `html` so a passing gate is still readable: open coverage/index.html and
      // click into a file to see which lines and branches are missed.
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      // These floors describe unit + storybook coverage MERGED, so judging them
      // against either run alone would fail on lines the other run covers.
      // `verify quality` sets COVERAGE_GATE when it merges the blob reports;
      // every other run collects coverage without being judged on it.
      thresholds: process.env.COVERAGE_GATE !== '1' ? undefined : {
        // A coverage lockfile, not a target. ADR 006 sets the target at 100
        // statements/lines/functions and 90 branches; these are what the suite
        // proves today, so the gate lands green and can only ratchet upward.
        //
        // Vitest applies the global floor to EVERY file, including ones matched
        // by a glob key - a glob can only raise a file, never exempt it. So the
        // global numbers sit at the weakest file (seed.js functions,
        // calendarDate.js branches) and each entry below pins a stronger file at
        // what it already achieves, which is what stops a 100% file quietly
        // sliding to 85%.
        perFile: true,
        statements: 85,
        lines: 85,
        functions: 50,
        branches: 75,

        '**/shared/src/calendarDate.js': { statements: 100, lines: 100, functions: 100, branches: 75 },
        '**/shared/src/datom.js': { statements: 100, lines: 100, functions: 100, branches: 100 },
        '**/shared/src/datomStore.js': { statements: 100, lines: 100, functions: 100, branches: 98 },
        '**/shared/src/selectors.js': { statements: 100, lines: 100, functions: 100, branches: 95 },
        '**/shared/src/todoProtocol.js': { statements: 100, lines: 100, functions: 100, branches: 100 },
        '**/shared/src/ulid.js': { statements: 99, lines: 99, functions: 81, branches: 96 },

        '**/backend/src/app.js': { statements: 89, lines: 89, functions: 100, branches: 77 },
        '**/backend/src/config.js': { statements: 89, lines: 89, functions: 100, branches: 85 },
        '**/backend/src/routes/datoms.js': { statements: 100, lines: 100, functions: 100, branches: 100 },
        '**/backend/src/seed.js': { statements: 85, lines: 85, functions: 50, branches: 100 },
        '**/backend/src/testing/sseClient.js': { statements: 97, lines: 97, functions: 100, branches: 91 },
        '**/backend/src/todos/datomJournal.js': { statements: 100, lines: 100, functions: 100, branches: 90 },
        '**/backend/src/todos/datomService.js': { statements: 100, lines: 100, functions: 100, branches: 89 },

        '**/frontend/src/testing/fakeDatomServer.js': { statements: 100, lines: 100, functions: 95, branches: 95 },
        '**/frontend/src/todos/components/focusLeft.js': { statements: 100, lines: 100, functions: 100, branches: 100 },
        '**/frontend/src/todos/legacyReplica.js': { statements: 90, lines: 90, functions: 100, branches: 75 },
        '**/frontend/src/todos/todoClient.js': { statements: 94, lines: 94, functions: 93, branches: 83 },
        '**/frontend/src/todos/todoListsUiState.js': { statements: 97, lines: 97, functions: 100, branches: 92 },
        '**/frontend/src/todos/todoModel.js': { statements: 100, lines: 100, functions: 100, branches: 94 },
        '**/frontend/src/todos/todoUiProtocol.js': { statements: 100, lines: 100, functions: 100, branches: 100 },
        '**/frontend/src/todos/useSettledText.js': { statements: 100, lines: 100, functions: 100, branches: 93 },
        '**/frontend/src/todos/useTodoLists.js': { statements: 100, lines: 100, functions: 100, branches: 100 },
      },
    },
  },
})
