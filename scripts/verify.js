import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { appendFile, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT, STAGES, findStage, findStep } from './stages.js'

const PASS = 'PASS'
const FAIL = 'FAIL'
const SKIP = 'SKIP'
const DIM = '[2m'
const RESET = '[0m'
const NAME_COLUMN_GAP = 1
const NAME_COLUMN_WIDTH = Math.max(...STAGES.flatMap(({ name, steps }) => [
  name.length,
  ...steps.map(({ name: stepName }) => stepName.length),
])) + NAME_COLUMN_GAP
const STATUS_COLUMN_WIDTH = 6
const SECONDS_COLUMN_WIDTH = 7
const CLI_USAGE_EXIT_CODE = 2
const FAILURE_DIVIDER_LENGTH = 60

const OFFLINE_SIGNS = [
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENETUNREACH',
  'ERR_SOCKET_CONNECTION_TIMEOUT',
]

/** Node is pinned by `.nvmrc`; mise does not activate in non-interactive shells. */
const assertNodeVersion = async () => {
  const pinned = (await readFile(resolve(ROOT, '.nvmrc'), 'utf8')).trim()
  const running = process.versions.node.split('.')[0]
  if (running === pinned) return
  process.stderr.write(
    `This repo runs Node ${pinned}; this shell is Node ${process.versions.node}.\n` +
      `Run through mise (\`mise exec node@${pinned} -- npm run verify\`) or activate it in your shell.\n`
  )
  process.exit(1)
}

/**
 * @param {import('./stages.js').Invocation} invocation
 * @returns {Promise<{ ok: boolean, offline: boolean, output: string }>}
 */
const runInvocation = ({ command, args, cwd, env, tolerateOffline }) =>
  new Promise((settle) => {
    const child = spawn(command, args, {
      cwd: cwd ?? ROOT,
      env: { ...process.env, ...env, FORCE_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    /** @param {Buffer | string} chunk */
    const collect = (chunk) => {
      output = `${output}${chunk}`
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.on('error', (error) => collect(`${error}\n`))
    child.on('close', (code) => {
      const offline =
        Boolean(tolerateOffline) &&
        code !== 0 &&
        OFFLINE_SIGNS.some((sign) => output.includes(sign))
      settle({ ok: code === 0 || offline, offline, output })
    })
  })

/**
 * @typedef {{
 *   name: string,
 *   status: string,
 *   seconds: number,
 *   output: string,
 *   note?: string,
 * }} Row
 */

/**
 * @param {import('./stages.js').Step} step
 * @returns {Promise<Row>}
 */
const runStep = async (step) => {
  const startedAt = Date.now()
  const results = []
  for (const invocation of step.invocations) {
    results.push(await runInvocation(invocation))
  }
  const failed = results.filter((result) => !result.ok)
  const skipped = failed.length === 0 && results.some((result) => result.offline)
  return {
    name: step.name,
    status: failed.length > 0 ? FAIL : skipped ? SKIP : PASS,
    seconds: (Date.now() - startedAt) / 1000,
    output: failed.map((result) => result.output).join('\n'),
  }
}

/** @param {Row} row */
const formatRow = ({ name, status, seconds, note }) =>
  `  ${name.padEnd(NAME_COLUMN_WIDTH)}${status.padEnd(STATUS_COLUMN_WIDTH)}${`${seconds.toFixed(1)}s`.padStart(SECONDS_COLUMN_WIDTH)}` +
  (note ? `   ${note}` : '')

const printHelp = () => {
  const lines = [
    '',
    '  npm run verify [stage|step ...]',
    '',
    '  Runs every stage in order. A stage that fails stops the ones after it,',
    '  because their results would no longer mean anything. Within a stage,',
    '  every step runs so you get the whole list at once.',
    '',
  ]
  for (const stage of STAGES) {
    lines.push(`  ${stage.name.padEnd(NAME_COLUMN_WIDTH)}${stage.blurb}`)
    for (const step of stage.steps) {
      lines.push(`    ${step.name.padEnd(NAME_COLUMN_WIDTH)}${step.blurb}`)
    }
    lines.push('')
  }
  lines.push('  npm run verify browser        one stage')
  lines.push('  npm run verify lint e2e       any mix of stages and steps')
  lines.push('')
  process.stdout.write(lines.join('\n'))
}

/** The owner-selected percentages, so a green run still reports what it proved. */
const coverageHeadline = async () => {
  try {
    const summary = JSON.parse(
      await readFile(resolve(ROOT, 'coverage/evidence-summary.json'), 'utf8')
    )
    const { statements, branches, functions } = summary.combinedOwnedRuntime
    /** @param {{covered: number, total: number}} value */
    const pct = ({ covered, total }) => total === 0 ? 100 : (covered * 100 / total).toFixed(2)
    return `combined owned runtime (Node + Storybook owner-selected): ${pct(statements)}% stmt · ${pct(branches)}% branch · ${pct(functions)}% func`
  } catch {
    return 'no summary written'
  }
}

/** @param {string[]} selectors */
const selectStages = (selectors) => {
  if (selectors.length === 0) return STAGES
  /** @type {Set<string>} */
  const wanted = new Set()
  for (const selector of selectors) {
    const stage = findStage(selector)
    if (stage) {
      for (const step of stage.steps) wanted.add(step.name)
      continue
    }
    const step = findStep(selector)
    if (!step) {
      process.stderr.write(`Unknown stage or step: ${selector}\nTry: npm run verify help\n`)
      process.exit(CLI_USAGE_EXIT_CODE)
    }
    wanted.add(step.name)
  }
  // Selection never reorders anything: stages and steps keep the order that
  // makes a failure meaningful.
  return STAGES.map((stage) => ({
    ...stage,
    steps: stage.steps.filter((step) => wanted.has(step.name)),
  })).filter((stage) => stage.steps.length > 0)
}

const main = async () => {
  const selectors = process.argv.slice(2)
  if (selectors.includes('help')) {
    printHelp()
    return
  }
  await assertNodeVersion()

  const stages = selectStages(selectors)
  const names = stages.flatMap((stage) => stage.steps.map((step) => step.name))

  // Both owner reports must come from this run. Stale artifacts from an earlier
  // partial run would make that judgement a lie, so a run that regenerates them
  // starts clean, and a run that cannot produce both simply does not judge.
  const regenerates = names.includes('unit')
  const canJudgeCoverage = names.includes('unit') && names.includes('storybook')
  if (regenerates) {
    await Promise.all([
      rm(resolve(ROOT, '.vitest-reports'), { recursive: true, force: true }),
      rm(resolve(ROOT, '.coverage-reports'), { recursive: true, force: true }),
      rm(resolve(ROOT, '.test-evidence'), { recursive: true, force: true }),
    ])
  }

  const rows = []
  let red = false

  for (const stage of stages) {
    for (const step of stage.steps) {
      if (step.name === 'coverage' && !canJudgeCoverage) {
        /** @type {Row} */
        const skipped = {
          name: step.name,
          status: SKIP,
          seconds: 0,
          output: '',
          note: 'needs unit and storybook in the same run',
        }
        rows.push(skipped)
        process.stdout.write(`${formatRow(skipped)}\n`)
        continue
      }
      const result = await runStep(step)
      // A gate you can only read by breaking it is a bad gate, so the coverage
      // headline travels with the row whether it passed or failed.
      if (step.name === 'coverage') result.note = await coverageHeadline()
      rows.push(result)
      process.stdout.write(`${formatRow(result)}\n`)
      if (result.status === FAIL) red = true
    }
    if (red) break
  }

  const failures = rows.filter((row) => row.status === FAIL)
  const verdict = red
    ? `  RED · ${failures.length} of ${rows.length} failed`
    : `  GREEN · ${rows.length} ${rows.length === 1 ? 'check' : 'checks'}`

  // Rows already streamed as they finished; only the verdict is new here.
  process.stdout.write(`\n${verdict}\n`)

  // A report nobody can find is a report nobody reads, so link the ones that
  // this run actually produced.
  const links = await Promise.all(
    rows
      .filter((row) => row.status !== SKIP)
      .map(async (row) => {
        const artifact = findStep(row.name)?.artifact
        if (!artifact) return null
        const path = resolve(ROOT, artifact)
        if (!existsSync(path)) return null
        return `  ${row.name.padEnd(NAME_COLUMN_WIDTH)}${DIM}${pathToFileURL(path).href}${RESET}`
      })
  )
  const found = links.filter((link) => link !== null)
  if (found.length > 0) process.stdout.write(`\n${found.join('\n')}\n`)

  for (const failure of failures) {
    process.stdout.write(
      `\n${'-'.repeat(FAILURE_DIVIDER_LENGTH)}\n${failure.name}\n${'-'.repeat(FAILURE_DIVIDER_LENGTH)}\n`
    )
    process.stdout.write(failure.output)
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      ['```', ...rows.map(formatRow), '', verdict, '```', ''].join('\n')
    )
  }

  process.exit(red ? 1 : 0)
}

await main()
