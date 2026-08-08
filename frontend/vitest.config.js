import { defineConfig } from 'vitest/config'

// The default-named config in `frontend/`, and the only one `@storybook/addon-vitest`
// can find. Running tests from the Storybook UI starts Vitest itself: it scans
// upward for a `vitest.workspace.*`, `vitest.config.*` or `vite.config.*` whose
// contents mention `@storybook/addon-vitest`, uses that file's directory as the
// Vitest root, and then filters for a project named `storybook:<configDir>`.
//
// `vitest.storybook.config.js` is not a name it scans for, so before this file
// existed the addon fell back to the happy-dom logic config, found no such
// project, and failed with "No projects matched the filter". Hence this file,
// which exists to be discovered and to name both projects.
//
// It is deliberately NOT what the root process runs. Root `vitest.config.mjs`
// points straight at `vitest.logic.config.js`, because pulling the browser
// project into the root process is what ADR 006 records as stalling.
export default defineConfig({
  test: {
    projects: ['./vitest.logic.config.js', './vitest.storybook.config.js'],
  },
})
