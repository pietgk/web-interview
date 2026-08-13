#!/usr/bin/env node
/**
 * Local `npm start` for the backend: free the dev-api port lane and bind the
 * durable dev journal (not preview / e2e / lighthouse).
 */
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEV_DATOM_LOG_PATH } from '../backend/src/dataPaths.js'
import { DEV_API_PORT, freeLanes } from './kill-ports.ts'

const BACKEND = resolve(dirname(fileURLToPath(import.meta.url)), '../backend')

freeLanes('dev-api')

const child = spawn(process.execPath, ['src/index.js'], {
  cwd: BACKEND,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: process.env.PORT ?? String(DEV_API_PORT),
    DATOM_LOG_PATH: process.env.DATOM_LOG_PATH ?? DEV_DATOM_LOG_PATH,
  },
})

child.on('exit', (code, signal) => {
  if (signal) process.exit(1)
  process.exit(code ?? 1)
})
