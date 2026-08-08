import { execFile } from 'node:child_process'
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import {
  createCoverageBaseline,
  evaluateCoverage,
  renderCoverageHtml,
  renderCoverageMarkdown,
} from './coverage-evidence.mjs'
import { ROOT } from './stages.mjs'

const execFileAsync = promisify(execFile)
const SUMMARY_PATH = `${ROOT}/coverage/coverage-summary.json`
const BASELINE_PATH = `${ROOT}/coverage-baseline.json`
const MARKDOWN_PATH = `${ROOT}/coverage/summary.md`
const HTML_PATH = `${ROOT}/coverage/report.html`
const VALID_MODES = new Set(['check', 'ratchet'])

/** @param {string} path @returns {Promise<Record<string, any>>} */
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))

const sourceProvenance = async () => {
  const [{ stdout: revision }, { stdout: status }] = await Promise.all([
    execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }),
    execFileAsync('git', ['status', '--porcelain'], { cwd: ROOT }),
  ])
  return {
    revision: revision.trim(),
    dirty: status.trim().length > 0,
    generatedAt: new Date().toISOString(),
    scope: 'merged unit + Storybook',
  }
}

/** @param {ReturnType<typeof evaluateCoverage>} evaluation */
const writeReports = async (evaluation) => {
  const markdown = renderCoverageMarkdown(evaluation)
  await Promise.all([
    writeFile(MARKDOWN_PATH, markdown),
    writeFile(HTML_PATH, renderCoverageHtml(evaluation)),
  ])
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown)
  }
}

const main = async () => {
  const requestedMode = process.env.COVERAGE_EVIDENCE_MODE ?? 'check'
  if (!VALID_MODES.has(requestedMode)) {
    throw new Error(`Unknown coverage evidence mode: ${requestedMode}`)
  }
  /** @type {'check' | 'ratchet'} */
  const mode = /** @type {'check' | 'ratchet'} */ (requestedMode)
  const [summary, rawBaseline] = await Promise.all([
    readJson(SUMMARY_PATH),
    readJson(BASELINE_PATH),
  ])
  if (rawBaseline.schemaVersion !== 1 || typeof rawBaseline.notice !== 'string' || !rawBaseline.files) {
    throw new Error('coverage-baseline.json is not a supported generated baseline')
  }
  const baseline = /** @type {ReturnType<typeof createCoverageBaseline>} */ (rawBaseline)

  let evaluation = evaluateCoverage({ summary, baseline, repositoryRoot: ROOT, mode })
  if (mode === 'ratchet' && evaluation.verdict === 'pass') {
    const updatedBaseline = createCoverageBaseline({ summary, repositoryRoot: ROOT })
    await writeFile(BASELINE_PATH, `${JSON.stringify(updatedBaseline, null, 2)}\n`)
    evaluation = evaluateCoverage({
      summary,
      baseline: updatedBaseline,
      repositoryRoot: ROOT,
      mode: 'check',
    })
  }

  evaluation.provenance = await sourceProvenance()
  await writeReports(evaluation)

  if (evaluation.verdict === 'fail') {
    const details = evaluation.changes
      .map(({ path, status, outcome }) => `${path}: ${status} (${outcome})`)
      .join('\n')
    process.stderr.write(`Coverage evidence does not match the committed baseline.\n${details}\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write(
    mode === 'ratchet'
      ? 'Coverage baseline ratcheted without regressions.\n'
      : 'Coverage evidence exactly matches the committed baseline.\n'
  )
}

await main()
