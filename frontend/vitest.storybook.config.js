import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vitest/config'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import viteConfig from './vite.config.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// The `storybook` project runs every story's play function and axe pass in real
// Chromium. It is the only reason `verify browser` costs what it does.
//
// This config is launched from `frontend/`, not from the root Vitest process,
// so that @vitest/browser resolves to exactly one copy. See ADR 006.
export default mergeConfig(
  { ...viteConfig, server: undefined, preview: undefined },
  defineConfig({
    root: dirname,
    plugins: [
      storybookTest({
        configDir: path.join(dirname, '.storybook'),
        // Do not spawn Storybook from Vitest - the UI already owns that process.
        // Spawning via storybookScript + watch easily re-triggers runs and hangs Stop.
        storybookUrl: 'http://localhost:6006',
      }),
    ],
    test: {
      name: 'storybook',
      // Stories exercise the same non-UI seams the root config gates. Collecting
      // here is what lets `verify quality` judge fakeDatomServer on what the
      // stories prove, not only on what its unit test proves.
      coverage: {
        provider: 'v8',
        // Must mirror the frontend entries in the root config's GATED_SEAMS, or
        // the merged report loses whatever only the stories exercise.
        include: ['src/todos/**/*.js', 'src/testing/*.js'],
        reporter: ['text-summary'],
      },
      browser: {
        enabled: true,
        headless: true,
        provider: 'playwright',
        instances: [{ browser: 'chromium' }],
      },
    },
  })
)
