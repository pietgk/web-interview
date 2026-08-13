import { execFile, spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import {
  createCoverageStabilitySnapshot,
  stabilityAdmissionIssues,
} from './coverage-producers.js'
import { exactCoveragePathsFor } from './source-evidence-registry.js'
import { ROOT } from './stages.js'

const execFileAsync = promisify(execFile)
const STORYBOOK_STABILITY_RUNS = 10
const STORYBOOK_COVERAGE_PORT = 6016
const STORYBOOK_START_TIMEOUT_MS = 120_000
const STORYBOOK_STOP_TIMEOUT_MS = 5_000
const STORYBOOK_READY_POLL_MS = 250
const STORYBOOK_URL = `http://127.0.0.1:${STORYBOOK_COVERAGE_PORT}`
const FRONTEND_ROOT = resolve(ROOT, 'frontend')
const STORYBOOK_BIN = resolve(FRONTEND_ROOT, 'node_modules/.bin/storybook')
const VITEST_BIN = resolve(FRONTEND_ROOT, 'node_modules/.bin/vitest')
const stabilityMode = process.argv.includes('--stability')
const allowDirtyWorktree = process.argv.includes('--allow-dirty-worktree')
const runCount = stabilityMode ? STORYBOOK_STABILITY_RUNS : 1

const startStorybook = () => {
  const server = spawn(STORYBOOK_BIN, [
    'dev',
    '--ci',
    '--no-open',
    '--host',
    '127.0.0.1',
    '--port',
    String(STORYBOOK_COVERAGE_PORT),
  ], {
    cwd: FRONTEND_ROOT,
    env: { ...process.env, BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let serverOutput = ''
  server.stdout.on('data', (chunk) => { serverOutput += chunk })
  server.stderr.on('data', (chunk) => { serverOutput += chunk })
  /** @type {{code: number | null, signal: NodeJS.Signals | null} | undefined} */
  let serverExit
  server.on('exit', (code, signal) => { serverExit = { code, signal } })

  const waitUntilReady = async () => {
    const deadline = Date.now() + STORYBOOK_START_TIMEOUT_MS
    while (Date.now() < deadline) {
      if (serverExit) throw new Error(`Storybook exited before becoming ready.\n${serverOutput}`)
      try {
        const response = await fetch(STORYBOOK_URL, { signal: AbortSignal.timeout(1_000) })
        if (response.ok) return
      } catch {
        // The finite server is still starting.
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, STORYBOOK_READY_POLL_MS))
    }
    throw new Error(`Storybook did not become ready within ${STORYBOOK_START_TIMEOUT_MS}ms.\n${serverOutput}`)
  }

  const stop = async () => {
    if (serverExit) return
    server.kill('SIGTERM')
    await Promise.race([
      new Promise((resolveExit) => server.once('exit', resolveExit)),
      new Promise((resolveDelay) => setTimeout(resolveDelay, STORYBOOK_STOP_TIMEOUT_MS)),
    ])
    if (!serverExit) {
      server.kill('SIGKILL')
      await new Promise((resolveExit) => server.once('exit', resolveExit))
    }
  }

  return { waitUntilReady, stop }
}

const readSourceState = async () => Promise.all([
    execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }),
    execFileAsync('git', ['status', '--porcelain'], { cwd: ROOT }),
  ]).then(([revision, status]) => ({
    revision: revision.stdout.trim(),
    dirty: status.stdout.trim().length > 0,
  }))

const sourceState = stabilityMode
  ? await readSourceState()
  : undefined

if (sourceState?.dirty && !allowDirtyWorktree) {
  throw new Error(stabilityAdmissionIssues({
    dirty: true,
    runDigests: [],
    expectedRuns: STORYBOOK_STABILITY_RUNS,
  })[0])
}

const tempRoot = stabilityMode
  ? await mkdtemp(join(tmpdir(), 'web-interview-storybook-stability-'))
  : undefined
/** @type {Array<ReturnType<typeof createCoverageStabilitySnapshot>>} */
const snapshots = []

try {
  for (let run = 1; run <= runCount; run += 1) {
    const storybook = startStorybook()
    try {
      await storybook.waitUntilReady()
      const reportsDirectory = stabilityMode
        ? resolve(/** @type {string} */ (tempRoot), `run-${run}`)
        : resolve(ROOT, '.coverage-reports/storybook')
      const evidenceDirectory = stabilityMode
        ? resolve(/** @type {string} */ (tempRoot), `evidence-${run}`)
        : resolve(ROOT, '.test-evidence')
      const blobDirectory = stabilityMode
        ? resolve(/** @type {string} */ (tempRoot), `blob-${run}`)
        : resolve(ROOT, '.vitest-reports')
      await Promise.all([
        mkdir(evidenceDirectory, { recursive: true }),
        mkdir(blobDirectory, { recursive: true }),
      ])
      const { stdout, stderr } = await execFileAsync(VITEST_BIN, [
        'run',
        '--config',
        'vitest.storybook.config.js',
        '--coverage',
        `--coverage.reportsDirectory=${reportsDirectory}`,
        '--reporter=default',
        '--reporter=blob',
        '--reporter=json',
        `--outputFile.blob=${resolve(blobDirectory, 'storybook.json')}`,
        `--outputFile.json=${resolve(evidenceDirectory, 'storybook.json')}`,
      ], {
        cwd: FRONTEND_ROOT,
        env: { ...process.env, STORYBOOK_URL },
        maxBuffer: 20 * 1024 * 1024,
      })
      if (!stabilityMode) process.stdout.write(`${stdout}${stderr}`)

      if (stabilityMode) {
        const [summary, map] = await Promise.all([
          readFile(resolve(reportsDirectory, 'coverage-summary.json'), 'utf8').then(JSON.parse),
          readFile(resolve(reportsDirectory, 'coverage-final.json'), 'utf8').then(JSON.parse),
        ])
        const snapshot = createCoverageStabilitySnapshot({
          repositoryRoot: ROOT,
          summary,
          map,
          paths: exactCoveragePathsFor('storybook'),
        })
        snapshots.push(snapshot)
        process.stdout.write(`Storybook stability collection ${run}/${runCount}: ${snapshot.digest}\n`)
      }
    } finally {
      await storybook.stop()
    }
  }

  if (stabilityMode) {
    const firstSnapshot = snapshots[0]
    if (!firstSnapshot) throw new Error('Storybook stability collected no controller evidence')
    const finalSourceState = await readSourceState()
    const runDigests = snapshots.map(({ digest }) => digest)
    const issues = stabilityAdmissionIssues({
      dirty: finalSourceState.dirty && !allowDirtyWorktree,
      revisionChanged: finalSourceState.revision !== /** @type {{revision: string}} */ (sourceState).revision,
      runDigests,
      expectedRuns: STORYBOOK_STABILITY_RUNS,
    })
    if (issues.length > 0) {
      throw new Error(issues.join('\n'))
    }
    await mkdir(resolve(ROOT, '.test-evidence'), { recursive: true })
    await writeFile(resolve(ROOT, '.test-evidence/storybook-stability.json'), `${JSON.stringify({
      schemaVersion: 1,
      revision: /** @type {{revision: string}} */ (sourceState).revision,
      dirty: finalSourceState.dirty,
      runs: runCount,
      controllerPaths: firstSnapshot.paths,
      snapshotDigest: firstSnapshot.digest,
    }, null, 2)}\n`)
    const collectionKind = finalSourceState.dirty ? 'working-tree' : 'clean'
    process.stdout.write(`Storybook controller coverage was identical across ${runCount} ${collectionKind} collections.\n`)
  }
} finally {
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true })
}
