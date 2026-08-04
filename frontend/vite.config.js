/// <reference types="vitest/config" />
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { DATOM_API_PATH } from '@web-interview/todos/protocol'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const DEVELOPMENT_PORT = Number(process.env.VITE_DEV_PORT ?? 3000)
const API_PROXY_TARGET =
  process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3001'
const API_PROXY = {
  [DATOM_API_PATH.ROOT]: API_PROXY_TARGET,
}

// Storybook/Vite write under these paths during a run; watching them re-triggers Vitest.
const WATCH_IGNORED = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.cache/**',
  '**/node_modules/.cache/**',
]

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['zod', 'react', 'react-dom'],
  },
  server: {
    port: DEVELOPMENT_PORT,
    open: true,
    proxy: API_PROXY,
    watch: {
      ignored: WATCH_IGNORED,
    },
  },
  preview: {
    proxy: API_PROXY,
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'happy-dom',
          globals: true,
          setupFiles: './src/setupTests.js',
          include: ['src/**/*.{test,spec}.{js,jsx}'],
          server: {
            deps: {
              inline: [/^@web-interview\/todos(?:\/|$)/, 'zod'],
            },
          },
        },
      },
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: path.join(dirname, '.storybook'),
            // Do not spawn Storybook from Vitest — the UI already owns that process.
            // Spawning via storybookScript + watch easily re-triggers runs and hangs Stop.
            storybookUrl: 'http://localhost:6006',
          }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: 'playwright',
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
