import { defineConfig, devices } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  E2E_API_BASE,
  E2E_API_PORT,
  E2E_WEB_PORT,
} from './e2e/environment.js'

// Playwright sets FORCE_COLOR=1 for its web servers and workers. Remove the
// conflicting inherited flag before those child processes are created.
delete process.env.NO_COLOR

const e2eDataDirectory = mkdtempSync(join(tmpdir(), 'web-interview-e2e-'))

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${E2E_WEB_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm start',
      cwd: './backend',
      url: `${E2E_API_BASE}/`,
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
      env: {
        ...process.env,
        APP_ENV: 'e2e',
        PORT: String(E2E_API_PORT),
        TODO_LOG_PATH: join(e2eDataDirectory, 'todos.jsonl'),
      },
    },
    {
      command: `npm start -- --host 127.0.0.1 --port ${E2E_WEB_PORT} --strictPort`,
      cwd: './frontend',
      url: `http://127.0.0.1:${E2E_WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
      env: {
        ...process.env,
        BROWSER: 'none',
        VITE_API_BASE: E2E_API_BASE,
      },
    },
  ],
})
