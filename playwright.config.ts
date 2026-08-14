import { defineConfig, devices } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  E2E_API_BASE,
  E2E_API_PORT,
  E2E_WEB_BASE,
  E2E_WEB_PORT,
} from './e2e/environment.ts'
import { E2E_SEED_TODO_LISTS } from './e2e/fixture.ts'

// Playwright sets FORCE_COLOR=1 for its web servers and workers. Remove the
// conflicting inherited flag before those child processes are created.
delete process.env['NO_COLOR']

const E2E_TEST_TIMEOUT_MS = 60_000
const WEB_SERVER_START_TIMEOUT_MS = 120_000
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 5_000

const e2eDataDirectory = mkdtempSync(join(tmpdir(), 'web-interview-e2e-'))

export default defineConfig({
  testDir: './e2e',
  timeout: E2E_TEST_TIMEOUT_MS,
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: E2E_WEB_BASE,
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
      timeout: WEB_SERVER_START_TIMEOUT_MS,
      gracefulShutdown: { signal: 'SIGTERM', timeout: GRACEFUL_SHUTDOWN_TIMEOUT_MS },
      env: {
        ...process.env,
        APP_ENV: 'e2e',
        CORS_ORIGINS: E2E_WEB_BASE,
        PORT: String(E2E_API_PORT),
        TODO_SEED_JSON: JSON.stringify(E2E_SEED_TODO_LISTS),
        DATOM_LOG_PATH: join(e2eDataDirectory, 'datoms.jsonl'),
      },
    },
    {
      command: `npm start -- --host 127.0.0.1 --port ${E2E_WEB_PORT} --strictPort`,
      cwd: './frontend',
      url: E2E_WEB_BASE,
      reuseExistingServer: false,
      timeout: WEB_SERVER_START_TIMEOUT_MS,
      gracefulShutdown: { signal: 'SIGTERM', timeout: GRACEFUL_SHUTDOWN_TIMEOUT_MS },
      env: {
        ...process.env,
        BROWSER: 'none',
        VITE_API_BASE: E2E_API_BASE,
      },
    },
  ],
})
