import { spawn, spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FRONTEND = resolve(ROOT, 'frontend')
const BACKEND = resolve(ROOT, 'backend')
const DEV_PORT = 3000
const BACKEND_PORT = 3001
const PREVIEW_PORT = 4173
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}/`
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}/`
const VITE = resolve(FRONTEND, 'node_modules/vite/bin/vite.js')

/** @typedef {import('node:child_process').ChildProcess} ChildProcess */

let shuttingDown = false
/** @type {ChildProcess | null} */
let backend = null
/** @type {ChildProcess | null} */
let preview = null
// Distinguishes "I stopped the backend" from "the backend fell over", which are
// the same event to Node and very different things to say out loud.
let backendStopRequested = false

/** @param {ChildProcess | null} child */
const isAlive = (child) =>
  child !== null && child.exitCode === null && child.signalCode === null

/** @param {ChildProcess} child @param {number} timeoutMs */
const waitForExit = (child, timeoutMs = 5_000) => new Promise((done) => {
  if (!isAlive(child)) {
    done(undefined)
    return
  }
  const timer = setTimeout(() => done(undefined), timeoutMs)
  child.once('exit', () => {
    clearTimeout(timer)
    done(undefined)
  })
})

/** @param {string} url @param {number} attempts */
const waitForUrl = async (url, attempts = 150) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return true
    } catch {
      // Still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
  }
  return false
}

/**
 * Only listeners, never clients. `lsof -i :3001` also matches anything merely
 * connected to that port, which includes the preview server proxying the datom
 * stream, so an unfiltered kill takes the frontend down with the backend.
 */
const freePorts = () => {
  const found = spawnSync('lsof', [
    '-ti', `tcp:${DEV_PORT}`,
    '-i', `tcp:${BACKEND_PORT}`,
    '-i', `tcp:${PREVIEW_PORT}`,
    '-sTCP:LISTEN',
  ], { encoding: 'utf8' })

  const pids = (found.stdout ?? '').split('\n').filter(Boolean)
  if (pids.length === 0) return
  console.log(`Freeing ports ${DEV_PORT}, ${BACKEND_PORT} and ${PREVIEW_PORT}: killing ${pids.join(', ')}`)
  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGTERM')
    } catch {
      // Already gone between the lookup and the signal.
    }
  }
}

const startBackend = async () => {
  if (isAlive(backend)) {
    console.log('Backend is already running.')
    return
  }

  backendStopRequested = false
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: BACKEND,
    // stdin stays with this script so the command prompt below owns the keyboard.
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, PORT: String(BACKEND_PORT) },
  })
  backend = child

  child.once('exit', (code, signal) => {
    if (shuttingDown) return
    console.log(
      backendStopRequested
        ? '\nBackend stopped. The app should now report a lost connection and disable editing.'
        : `\nBackend exited on its own (${signal ?? code}). The app should now report a lost connection.`
    )
    console.log("Type 'start' to bring it back.")
  })

  if (await waitForUrl(BACKEND_URL)) {
    console.log(`Backend ready on ${BACKEND_URL}`)
    return
  }
  console.error(`Backend did not answer on ${BACKEND_URL}.`)
}

const stopBackend = async () => {
  if (!isAlive(backend)) {
    console.log('Backend is not running.')
    return
  }
  backendStopRequested = true
  const child = /** @type {ChildProcess} */ (backend)
  child.kill('SIGTERM')
  await waitForExit(child)
}

const startPreview = () => {
  const child = spawn(process.execPath, [
    VITE,
    'preview',
    '--port', String(PREVIEW_PORT),
    '--strictPort',
    '--open',
  ], {
    cwd: FRONTEND,
    // Without this, Vite's own "press h + enter" prompt competes for stdin.
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  preview = child

  child.once('exit', (code, signal) => {
    if (shuttingDown) return
    // Usually collateral from an unfiltered `lsof -ti tcp:3001 | xargs kill`,
    // since the preview server holds a proxy connection to the backend port.
    console.error(`\nPreview server stopped unexpectedly (${signal ?? code}).`)
    void shutdown(1)
  })
}

/** @param {number} exitCode */
const shutdown = async (exitCode = 0) => {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of [preview, backend]) {
    if (isAlive(child)) /** @type {ChildProcess} */ (child).kill('SIGTERM')
  }
  await Promise.all(
    [preview, backend].filter(isAlive).map((child) =>
      waitForExit(/** @type {ChildProcess} */ (child), 3_000)
    )
  )
  process.exit(exitCode)
}

const COMMANDS = `
Demo controls (type a command and press enter):
  stop     stop the backend, to show the lost-connection state
  start    start the backend again and watch the app recover
  restart  stop and start the backend
  quit     stop everything and exit
  help     show this list
`

/** @param {string} line */
const runCommand = async (line) => {
  switch (line.trim().toLowerCase()) {
    case 'stop':
      return stopBackend()
    case 'start':
      return startBackend()
    case 'restart':
      await stopBackend()
      return startBackend()
    case 'quit':
    case 'exit':
    case 'q':
      return shutdown(0)
    case 'help':
    case 'h':
    case '?':
      console.log(COMMANDS)
      return undefined
    case '':
      return undefined
    default:
      console.log(`Unknown command. ${COMMANDS}`)
      return undefined
  }
}

// A signal handler replaces the default terminate, so it has to exit explicitly
// or the script outlives its own shutdown and keeps holding the ports.
for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) {
  process.once(signal, () => void shutdown(0))
}

freePorts()

// `vite preview` serves whatever is in dist/ and says nothing when dist/ is
// missing or stale, so the demo always builds first.
const build = spawn(process.execPath, [VITE, 'build'], { cwd: FRONTEND, stdio: 'inherit' })
const buildExit = await new Promise((done) => build.once('exit', done))
if (buildExit !== 0) {
  console.error(`Build failed (${buildExit}); not starting the demo.`)
  process.exit(1)
}

await startBackend()
// The preview proxy forwards /api/datoms to the backend, so the datom stream
// only opens once the backend above is answering.
startPreview()

const rl = createInterface({ input: process.stdin })
rl.on('line', (line) => void runCommand(line))

if (process.stdin.isTTY) {
  // Closing a terminal's stdin (Ctrl-D) means quit. A redirected stdin reaches
  // EOF immediately and means nothing, so only a terminal gets that binding.
  rl.once('close', () => void shutdown(0))
  console.log(COMMANDS)
} else {
  console.log(`Preview on ${PREVIEW_URL}. Commands still read from stdin; Ctrl-C to stop.`)
}
