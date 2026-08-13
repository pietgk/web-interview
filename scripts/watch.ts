import { spawn } from 'node:child_process'
import { watch } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { ROOT } from './stages.ts'

// Everything here runs in Node and finishes in about two seconds.
// Storybook and Playwright are deliberately absent: they need a real browser,
// which is what `verify browser` is for. The component loop is `npm run storybook`.
const WATCHED = ['shared/src', 'backend/src', 'frontend/src', 'scripts']
const DEBOUNCE_MS = 200

// Vitest, tsc, and the coverage reporters all write inside the tree we watch.
const IGNORED = /(?:^|[\\/])(?:node_modules|dist|build|coverage|\.vitest-reports|\.cache)(?:[\\/]|$)/

const GREEN = '[32m'
const RED = '[31m'
const DIM = '[2m'
const RESET = '[0m'

const run = (command: string, args: string[]): Promise<{ ok: boolean, output: string }> =>
  new Promise((settle) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: { ...process.env, FORCE_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const collect = (chunk: Buffer | string) => {
      output = `${output}${chunk}`
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.on('error', (error) => collect(`${error}\n`))
    child.on('close', (code) => settle({ ok: code === 0, output }))
  })

const assertNodeVersion = async () => {
  const pinned = (await readFile(resolve(ROOT, '.nvmrc'), 'utf8')).trim()
  if (process.versions.node.split('.')[0] === pinned) return
  process.stderr.write(
    `This repo runs Node ${pinned}; this shell is Node ${process.versions.node}.\n` +
      `Run through mise (\`mise exec node@${pinned} -- npm run watch\`) or activate it in your shell.\n`
  )
  process.exit(1)
}

// Vitest is run with colour on, so the count is wrapped in escape codes.
// eslint-disable-next-line no-control-regex
const ANSI = /\[[0-9;]*m/g

const testCount = (output: string) => {
  const match = output.replace(ANSI, '').match(/Tests\s+(\d+) passed/)
  return match ? match[1] : '?'
}

let running = false
let queued = false

const cycle = async (reason: string) => {
  if (running) {
    queued = true
    return
  }
  running = true
  const startedAt = Date.now()
  // `\r` plus a clear so the finished banner replaces this line rather than
  // trailing after it.
  process.stdout.write(`${DIM}running${reason ? ` · ${reason}` : ''}${RESET}[K\r`)

  // Both checks always run. Types and tests fail in different ways, and knowing
  // only the first failure would mean another save just to see the second.
  const [tests, types] = await Promise.all([
    run(resolve(ROOT, 'node_modules/.bin/vitest'), ['run', '--reporter=dot']),
    run('npm', ['run', 'typecheck']),
  ])

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
  const stamp = new Date().toTimeString().slice(0, 8)
  const ok = tests.ok && types.ok

  if (ok) {
    process.stdout.write(
      `${GREEN}GREEN${RESET}  ${testCount(tests.output)} tests · types ok` +
        `  ${DIM}${seconds}s · ${stamp}${RESET}\n`
    )
  } else {
    const broken = [!tests.ok && 'tests', !types.ok && 'types'].filter(Boolean).join(' + ')
    process.stdout.write(
      `${RED}RED${RESET}    ${broken}  ${DIM}${seconds}s · ${stamp}${RESET}\n\n`
    )
    if (!types.ok) process.stdout.write(`${types.output}\n`)
    if (!tests.ok) process.stdout.write(`${tests.output}\n`)
  }

  running = false
  if (queued) {
    queued = false
    await cycle('queued change')
  }
}

const main = async () => {
  await assertNodeVersion()
  process.stdout.write(
    `${DIM}watching ${WATCHED.join(' ')} · Ctrl-C to stop${RESET}\n`
  )

  let pending: NodeJS.Timeout | null = null
  for (const directory of WATCHED) {
    watch(resolve(ROOT, directory), { recursive: true }, (_event, filename) => {
      if (!filename || IGNORED.test(filename)) return
      if (pending) clearTimeout(pending)
      pending = setTimeout(() => {
        pending = null
        void cycle(relative(ROOT, resolve(ROOT, directory, filename)))
      }, DEBOUNCE_MS)
    })
  }

  await cycle('start')
}

await main()
