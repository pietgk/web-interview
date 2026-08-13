#!/usr/bin/env node
/**
 * Playwright UI on the dedicated e2e-ui port lane (3110/3111), so a live inspect
 * session does not block `verify e2e` on 3100/3101.
 */
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { E2E_UI_API_PORT, E2E_UI_WEB_PORT } from '../e2e/environment.ts'
import { freeLanes } from './kill-ports.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const playwright = resolve(ROOT, 'node_modules/.bin/playwright')

freeLanes('e2e-ui')

const child = spawn(
  playwright,
  ['test', '--ui', ...process.argv.slice(2)],
  {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      E2E_WEB_PORT: String(E2E_UI_WEB_PORT),
      E2E_API_PORT: String(E2E_UI_API_PORT),
    },
  }
)

child.on('exit', (code, signal) => {
  if (signal) {
    process.exit(1)
  }
  process.exit(code ?? 1)
})
