import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import viteConfig from './vite.config.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// The `storybook` project runs every story's play function and axe pass in real
// Chromium. It is the only reason `verify browser` costs what it does.
//
// This config is launched from `frontend/`, not from the root Vitest process,
// so that the browser provider and runner resolve through one install. See ADR 006.
export default mergeConfig(
  { ...viteConfig, server: undefined, preview: undefined },
  defineConfig({
    root: dirname,
    plugins: [
      storybookTest({
        configDir: path.join(dirname, '.storybook'),
        // Do not spawn Storybook from Vitest - the UI already owns that process.
        // Spawning via storybookScript + watch easily re-triggers runs and hangs Stop.
        storybookUrl: process.env.STORYBOOK_URL ?? 'http://localhost:6006',
      }),
    ],
    test: {
      name: 'storybook',
      // Collect controller, rendered UI, and incidental runtime reach. The
      // explicit evidence registry decides which controller files Storybook can
      // gate; overlap with Node-owned files is informational only.
      coverage: {
        provider: 'v8',
        // The evidence module keeps owner exact coverage and rendered UI
        // percentages separate.
        include: ['src/**/*.js', 'src/**/*.jsx'],
        // Vitest matches coverage includes as partial paths, so `*.js` also
        // matches the prefix of `*.jsx` unless the suffix is explicit here.
        exclude: [
          '**/*.test.js',
          '**/*.spec.js',
          '**/*.stories.jsx',
          'src/index.jsx',
          'src/testing/storyHarness.jsx',
        ],
        // Browser bundles remap to their original JSX and test sources only
        // after collection. Reapply collection scope after remapping.
        excludeAfterRemap: true,
        reporter: ['text-summary', 'json-summary', 'json'],
        reportsDirectory: '../.coverage-reports/storybook',
      },
      browser: {
        enabled: true,
        headless: true,
        provider: playwright({}),
        instances: [{ browser: 'chromium' }],
      },
    },
  })
)
