import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PREVIEW_API_PORT,
  PREVIEW_WEB_PORT,
  freeLanes,
} from './kill-ports.mjs'
import { PREVIEW_DATOM_LOG_PATH } from '../backend/src/dataPaths.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FRONTEND = resolve(ROOT, 'frontend')
const BACKEND = resolve(ROOT, 'backend')
const START_POLL_INTERVAL_MS = 100
const BACKEND_URL = `http://127.0.0.1:${PREVIEW_API_PORT}/`
const PREVIEW_URL = `http://localhost:${PREVIEW_WEB_PORT}/`
/**
 * The demo talks to the backend directly rather than through the preview proxy.
 * The proxy holds a client connection open after the backend dies, so the
 * browser's `EventSource` never fires `onerror` and the app keeps claiming it is
 * connected. Going direct is also the path the end-to-end tests exercise.
 * Preview API is {@link PREVIEW_API_PORT}, not the `npm start` backend, so local
 * Vite can stay up alongside this demo.
 */
const DEMO_API_BASE = `http://localhost:${PREVIEW_API_PORT}`
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
/** @type {import('node:readline').Interface | null} */
let prompt = null

/** @param {ChildProcess | null} child */
const isAlive = (child) =>
  child !== null && child.exitCode === null && child.signalCode === null

/** Backend up/down is the state this demo toggles; keep it in the prompt itself. */
const statusPrompt = () => `${isAlive(backend) ? 'up' : 'down'} >> `

/** The servers write to stdout whenever they like, so redraw after every one. */
const reprompt = () => {
  if (!prompt) return
  prompt.setPrompt(statusPrompt())
  prompt.prompt()
}

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
    await new Promise((resolveDelay) => setTimeout(resolveDelay, START_POLL_INTERVAL_MS))
  }
  return false
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
    env: {
      ...process.env,
      PORT: String(PREVIEW_API_PORT),
      CORS_ORIGINS: PREVIEW_URL.slice(0, -1),
      DATOM_LOG_PATH: PREVIEW_DATOM_LOG_PATH,
    },
  })
  backend = child

  child.once('exit', (code, signal) => {
    if (shuttingDown) return
    console.log(
      backendStopRequested
        ? '\nBackend stopped. The app should now say "Connection lost".'
        : `\nBackend exited on its own (${signal ?? code}). The app should now say "Connection lost".`
    )
    // Editing stays enabled once the client has a server clock; edits queue in
    // the in-memory outbox and drain on reconnect.
    console.log("Edits still work and queue up. Type 'toggle' to bring it back and watch them drain.")
    // A requested stop is still inside a command, which redraws the prompt once
    // it finishes. Only an exit nobody asked for needs its own redraw.
    if (!backendStopRequested) reprompt()
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

const toggleBackend = async () => {
  if (isAlive(backend)) {
    await stopBackend()
    return
  }
  await startBackend()
}

const startPreview = async () => {
  const child = spawn(process.execPath, [
    VITE,
    'preview',
    '--port', String(PREVIEW_WEB_PORT),
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
    console.error(`\nPreview server stopped unexpectedly (${signal ?? code}).`)
    void shutdown(1)
  })

  // Wait until the preview is answering so its startup banner lands before the
  // interactive prompt; otherwise the two fight for the same line.
  if (await waitForUrl(PREVIEW_URL)) return
  console.error(`Preview did not answer on ${PREVIEW_URL}.`)
  await shutdown(1)
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

/** @typedef {{name: string, aliases?: string[], help: string, run: () => unknown}} Command */

/** @type {Command[]} */
const COMMANDS = [
  {
    name: 'toggle',
    help: 'flip the backend (lost-connection ↔ recover / outbox drain)',
    run: () => toggleBackend(),
  },
  { name: 'quit', aliases: ['exit'], help: 'stop everything and exit', run: () => shutdown(0) },
  { name: 'help', aliases: ['?'], help: 'show this list', run: () => printCommands() },
]

function printCommands() {
  console.log('\nDemo controls. Any unambiguous prefix works, so q and t are enough:')
  for (const { name, help } of COMMANDS) console.log(`  ${name.padEnd(8)}${help}`)
  console.log('')
}

/**
 * No command is a prefix of another, but an exact match still wins first so that
 * adding one later cannot quietly make an existing command unreachable.
 *
 * @param {string} typed
 * @returns {{command: Command} | {ambiguous: Command[]} | {unknown: true} | null}
 */
const resolveCommand = (typed) => {
  if (!typed) return null
  const exact = COMMANDS.find(
    (command) => command.name === typed || command.aliases?.includes(typed)
  )
  if (exact) return { command: exact }

  const matches = COMMANDS.filter((command) => command.name.startsWith(typed))
  if (matches.length === 1) return { command: matches[0] }
  if (matches.length > 1) return { ambiguous: matches }
  return { unknown: true }
}

/** @param {string} line */
const runCommand = async (line) => {
  const typed = line.trim().toLowerCase()
  const resolved = resolveCommand(typed)
  if (!resolved) return

  if ('command' in resolved) {
    await resolved.command.run()
    return
  }
  if ('ambiguous' in resolved) {
    console.log(
      `"${typed}" matches ${resolved.ambiguous.map((command) => command.name).join(' and ')}. Type more of it.`
    )
    return
  }
  console.log(`Unknown command "${typed}".`)
  printCommands()
}

// A signal handler replaces the default terminate, so it has to exit explicitly
// or the script outlives its own shutdown and keeps holding the ports.
for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) {
  process.once(signal, () => void shutdown(0))
}

freeLanes('preview')

// `vite preview` serves whatever is in dist/ and says nothing when dist/ is
// missing or stale, so the demo always builds first.
// `VITE_API_BASE` is substituted at build time, so the demo has to bake it in.
const build = spawn(process.execPath, [VITE, 'build'], {
  cwd: FRONTEND,
  stdio: 'inherit',
  env: { ...process.env, VITE_API_BASE: DEMO_API_BASE },
})
const buildExit = await new Promise((done) => build.once('exit', done))
if (buildExit !== 0) {
  console.error(`Build failed (${buildExit}); not starting the demo.`)
  process.exit(1)
}

// The browser opens its datom stream as soon as the page loads, so the backend
// comes up first. The prompt waits for both so their banners finish first.
await startBackend()
await startPreview()

prompt = createInterface({ input: process.stdin, output: process.stdout, prompt: statusPrompt() })
prompt.on('line', async (line) => {
  await runCommand(line)
  if (!shuttingDown) reprompt()
})

if (process.stdin.isTTY) {
  // Closing a terminal's stdin (Ctrl-D) means quit. A redirected stdin reaches
  // EOF immediately and means nothing, so only a terminal gets that binding.
  prompt.once('close', () => void shutdown(0))
  printCommands()
} else {
  console.log(`Preview on ${PREVIEW_URL}. Commands still read from stdin; Ctrl-C to stop.`)
}
reprompt()
