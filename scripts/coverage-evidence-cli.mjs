import { execFile } from 'node:child_process'
import { appendFile, readFile, readdir, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import {
  createCoverageBaseline,
  evaluateCoverage,
  renderCoverageHtml,
  renderCoverageMarkdown,
} from './coverage-evidence.mjs'
import { classifySourcePath, createSourceEvidence } from './source-evidence.mjs'
import { ROOT } from './stages.mjs'

const execFileAsync = promisify(execFile)
const SUMMARY_PATH = `${ROOT}/coverage/coverage-summary.json`
const BASELINE_PATH = `${ROOT}/coverage-baseline.json`
const MARKDOWN_PATH = `${ROOT}/coverage/summary.md`
const HTML_PATH = `${ROOT}/coverage/report.html`
const EVIDENCE_SUMMARY_PATH = `${ROOT}/coverage/evidence-summary.json`
const STORY_RESULTS_PATH = `${ROOT}/.test-evidence/storybook.json`
const VALID_MODES = new Set(['check', 'ratchet'])

/** @param {string} path @returns {Promise<Record<string, any>>} */
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))

/** @param {string} directory @returns {Promise<string[]>} */
const filesUnder = async (directory) => (await Promise.all(
  (await readdir(directory, { withFileTypes: true })).map((entry) => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? filesUnder(path) : path
  })
)).flat()

const sourceInputs = async () => {
  const absoluteFiles = (await Promise.all([
    filesUnder(resolve(ROOT, 'shared/src')),
    filesUnder(resolve(ROOT, 'backend/src')),
    filesUnder(resolve(ROOT, 'frontend/src')),
  ])).flat()
  const relativeFiles = absoluteFiles
    .map((path) => relative(ROOT, path).split('\\').join('/'))
    .sort()
  const sourcePaths = relativeFiles.filter((path) =>
    /\.(?:[cm]?[jt]sx?)$/.test(path) && !/\.(?:test|spec|stories)\.(?:[cm]?[jt]sx?)$/.test(path)
  )
  const storyPaths = relativeFiles.filter((path) => /\.stories\.(?:[cm]?[jt]sx?)$/.test(path))
  const storySources = Object.fromEntries(await Promise.all(storyPaths.map(async (path) => [
    path,
    await readFile(resolve(ROOT, path), 'utf8'),
  ])))
  return { sourcePaths, storySources }
}

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
    writeFile(EVIDENCE_SUMMARY_PATH, `${JSON.stringify({ gatedLogic: evaluation.global }, null, 2)}\n`),
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
  const [summary, rawBaseline, storyResults, sources] = await Promise.all([
    readJson(SUMMARY_PATH),
    readJson(BASELINE_PATH),
    readJson(STORY_RESULTS_PATH),
    sourceInputs(),
  ])
  if (rawBaseline.schemaVersion !== 1 || typeof rawBaseline.notice !== 'string' || !rawBaseline.files) {
    throw new Error('coverage-baseline.json is not a supported generated baseline')
  }
  const baseline = /** @type {ReturnType<typeof createCoverageBaseline>} */ (rawBaseline)
  const gatedPaths = sources.sourcePaths.filter((path) =>
    classifySourcePath(path)?.category === 'logic-ratchet'
  )

  let activeBaseline = baseline
  let evaluation = evaluateCoverage({
    summary,
    baseline: activeBaseline,
    repositoryRoot: ROOT,
    mode,
    gatedPaths,
  })
  if (mode === 'ratchet' && evaluation.verdict === 'pass') {
    const updatedBaseline = createCoverageBaseline({ summary, repositoryRoot: ROOT, gatedPaths })
    await writeFile(BASELINE_PATH, `${JSON.stringify(updatedBaseline, null, 2)}\n`)
    activeBaseline = updatedBaseline
  }

  const sourceEvidence = createSourceEvidence({
    ...sources,
    baselinePaths: Object.keys(activeBaseline.files),
    summary,
    repositoryRoot: ROOT,
    storyResults,
  })
  evaluation = evaluateCoverage({
    summary,
    baseline: activeBaseline,
    repositoryRoot: ROOT,
    mode: mode === 'ratchet' ? 'check' : mode,
    gatedPaths,
    sourceEvidence,
  })

  evaluation.provenance = await sourceProvenance()
  await writeReports(evaluation)

  if (evaluation.verdict === 'fail') {
    const coverageDetails = evaluation.changes
      .map(({ path, status, outcome }) => `${path}: ${status} (${outcome})`)
    const details = [...coverageDetails, ...sourceEvidence.issues].join('\n')
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
