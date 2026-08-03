import { spawn } from 'node:child_process'
import { appendFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import {
  createLighthouseSummary,
  evaluateLighthouseQuality,
} from './lighthouse-report.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPORT_DIRECTORY = resolve(ROOT, 'lighthouse-reports')
const WEB_PORT = 3200
const API_PORT = 3201
const WEB_URL = `http://127.0.0.1:${WEB_PORT}/`
const API_URL = `http://127.0.0.1:${API_PORT}/`
const NUMBER_OF_RUNS = 3
const BUDGETS = Object.freeze({
  maxScriptTransferBytes: 140 * 1024,
  maxUnusedJavaScriptBytes: 52 * 1024,
})
const LIGHTHOUSE_SEED_TODO_LISTS = Object.freeze([
  {
    title: 'Lighthouse Primary List',
    todos: [{ text: 'First Lighthouse todo', completed: false, dueDate: null }],
  },
  { title: 'Lighthouse Secondary List', todos: [] },
])

const LIGHTHOUSE_ENV = {
  ...process.env,
  CHROME_PATH: process.env.CHROME_PATH ?? chromium.executablePath(),
}

/** @param {string} name @param {string} command @param {string[]} args @param {import('node:child_process').SpawnOptions} options */
const startChild = (name, command, args, options) => {
  const child = spawn(command, args, {
    ...options,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  /** @param {Buffer | string | Error} chunk */
  const collect = (chunk) => {
    output = `${output}${chunk}`.slice(-20_000)
  }
  child.stdout?.on('data', collect)
  child.stderr?.on('data', collect)
  child.on('error', collect)
  return { name, child, output: () => output }
}

/** @param {ReturnType<typeof startChild>} processInfo */
const stopChild = async ({ child }) => {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise((resolveExit) => child.once('exit', resolveExit))
  try {
    child.kill('SIGTERM')
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ESRCH') throw error
  }
  await Promise.race([
    exited,
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 5_000)),
  ])
}

/** @param {string} url @param {ReturnType<typeof startChild>[]} processes */
const waitForUrl = async (url, processes) => {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    for (const processInfo of processes) {
      if (processInfo.child.exitCode !== null) {
        throw new Error(
          `${processInfo.name} exited with code ${processInfo.child.exitCode}\n${processInfo.output()}`
        )
      }
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

/** @param {string[]} args */
const runCommand = (args) => new Promise((resolveCommand, rejectCommand) => {
  const command = spawn(process.execPath, args, {
    cwd: ROOT,
    env: LIGHTHOUSE_ENV,
    stdio: 'inherit',
  })
  command.once('error', rejectCommand)
  command.once('exit', (code, signal) => {
    if (code === 0) resolveCommand(undefined)
    else rejectCommand(new Error(`Lighthouse exited with ${code ?? signal}`))
  })
})

const readReports = async () => {
  const reportFiles = (await readdir(REPORT_DIRECTORY))
    .filter((name) => name.endsWith('.report.json'))
    .sort()
  return Promise.all(reportFiles.map(async (name) =>
    JSON.parse(await readFile(resolve(REPORT_DIRECTORY, name), 'utf8'))
  ))
}

/** @param {number} bytes */
const kibibytes = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`

const main = async () => {
  await rm(REPORT_DIRECTORY, { recursive: true, force: true })
  await mkdir(REPORT_DIRECTORY, { recursive: true })
  const dataDirectory = await mkdtemp(join(tmpdir(), 'web-interview-lighthouse-'))
  /** @type {ReturnType<typeof startChild>[]} */
  const processes = []

  try {
    processes.push(startChild('backend', process.execPath, ['src/index.js'], {
      cwd: resolve(ROOT, 'backend'),
      env: {
        ...process.env,
        APP_ENV: 'lighthouse',
        CORS_ORIGINS: WEB_URL.slice(0, -1),
        PORT: String(API_PORT),
        DATOM_LOG_PATH: resolve(dataDirectory, 'datoms.jsonl'),
        TODO_SEED_JSON: JSON.stringify(LIGHTHOUSE_SEED_TODO_LISTS),
      },
    }))
    processes.push(startChild('frontend preview', process.execPath, [
      resolve(ROOT, 'frontend/node_modules/vite/bin/vite.js'),
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(WEB_PORT),
      '--strictPort',
    ], {
      cwd: resolve(ROOT, 'frontend'),
      env: {
        ...process.env,
        BROWSER: 'none',
        VITE_API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}`,
      },
    }))

    await waitForUrl(API_URL, processes)
    await waitForUrl(WEB_URL, processes)

    const lighthouseCli = resolve(ROOT, 'node_modules/lighthouse/cli/index.js')
    for (let run = 1; run <= NUMBER_OF_RUNS; run += 1) {
      await runCommand([
        lighthouseCli,
        WEB_URL,
        '--quiet',
        '--preset=desktop',
        '--chrome-flags=--headless=new --no-sandbox',
        '--output=json',
        '--output=html',
        `--output-path=${resolve(REPORT_DIRECTORY, `run-${run}`)}`,
      ])
    }

    const reports = await readReports()
    if (reports.length !== NUMBER_OF_RUNS) {
      throw new Error(`Expected ${NUMBER_OF_RUNS} Lighthouse reports, found ${reports.length}`)
    }
    const quality = evaluateLighthouseQuality(reports, BUDGETS)
    const summary = [
      createLighthouseSummary(reports),
      '### JavaScript budgets',
      '',
      '| Measure | Worst run | Budget |',
      '| --- | ---: | ---: |',
      `| Initial transfer | ${kibibytes(quality.largestScriptTransfer ?? 0)} | ${kibibytes(BUDGETS.maxScriptTransferBytes)} |`,
      `| Estimated unused | ${kibibytes(quality.largestUnusedJavaScript ?? 0)} | ${kibibytes(BUDGETS.maxUnusedJavaScriptBytes)} |`,
      '',
    ].join('\n')
    await writeFile(resolve(REPORT_DIRECTORY, 'summary.md'), summary)
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, summary)
    }
    process.stdout.write(`${summary}\n`)

    if (!quality.passed) {
      throw new Error(`Lighthouse quality failed:\n- ${quality.failures.join('\n- ')}`)
    }
  } finally {
    await Promise.all(processes.map(stopChild))
    await rm(dataDirectory, { recursive: true, force: true })
  }
}

await main()
