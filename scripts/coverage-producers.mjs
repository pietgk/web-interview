import { createHash } from 'node:crypto'
import { relative, resolve, sep } from 'node:path'

/** @typedef {'statements' | 'branches' | 'functions' | 'lines'} CoverageMetric */
/** @typedef {Record<CoverageMetric, {covered: number, total: number}>} FileCoverage */

/** @type {readonly CoverageMetric[]} */
export const COVERAGE_METRICS = Object.freeze([
  'statements',
  'branches',
  'functions',
  'lines',
])

export const PRODUCER_CONFIG_PATHS = Object.freeze({
  node: Object.freeze([
    'vitest.config.mjs',
    'shared/vitest.config.js',
    'backend/vitest.config.js',
    'frontend/vitest.logic.config.js',
    'scripts/vitest.config.js',
  ]),
  storybook: Object.freeze([
    'frontend/vitest.storybook.config.js',
    'frontend/vite.config.js',
    'frontend/.storybook/main.js',
    'frontend/.storybook/preview.jsx',
  ]),
})

const EMPTY_COVERAGE = Object.freeze(/** @type {FileCoverage} */ (Object.fromEntries(
  COVERAGE_METRICS.map((metric) => [metric, Object.freeze({ covered: 0, total: 0 })])
)))

/** @param {string} path @param {string} repositoryRoot */
export const normalizeCoveragePath = (path, repositoryRoot) =>
  relative(resolve(repositoryRoot), resolve(path)).split(sep).join('/')

/** @param {unknown} value @returns {unknown} */
const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [
    key,
    stableValue(/** @type {Record<string, unknown>} */ (value)[key]),
  ]))
}

/** @param {Record<string, string>} inputs */
export const createEvidenceDigest = (inputs) => createHash('sha256')
  .update(JSON.stringify(stableValue(inputs)))
  .digest('hex')

/**
 * @param {{producer: string, manifest: Record<string, any>, revision: string, dirty: boolean, currentInputDigest: string}} input
 */
export const validateProducerManifest = ({
  producer,
  manifest,
  revision,
  dirty,
  currentInputDigest,
}) => {
  const issues = []
  if (manifest.schemaVersion !== 1) issues.push(`${producer} coverage manifest has an unsupported schema`)
  if (manifest.producer !== producer) issues.push(`${producer} coverage manifest identifies ${manifest.producer ?? 'no producer'}`)
  if (manifest.revision !== revision || manifest.dirty !== dirty) {
    issues.push(`${producer} coverage source state does not match the current revision`)
  }
  if (manifest.inputDigest !== currentInputDigest) {
    issues.push(`${producer} coverage input digest does not match the current source and configuration`)
  }
  return issues
}

/** @param {Record<string, any>} raw @returns {FileCoverage} */
export const exactCoverage = (raw) => /** @type {FileCoverage} */ (Object.fromEntries(COVERAGE_METRICS.map((metric) => [
  metric,
  { covered: raw[metric].covered, total: raw[metric].total },
])))

/** @param {FileCoverage[]} coverages @returns {FileCoverage} */
export const sumCoverage = (coverages) => /** @type {FileCoverage} */ (Object.fromEntries(COVERAGE_METRICS.map((metric) => [
  metric,
  coverages.reduce((sum, coverage) => ({
    covered: sum.covered + coverage[metric].covered,
    total: sum.total + coverage[metric].total,
  }), { covered: 0, total: 0 }),
])))

/** @param {Record<string, any>} summary @param {string} repositoryRoot @returns {Record<string, FileCoverage>} */
export const normalizeCoverageSummary = (summary, repositoryRoot) => Object.fromEntries(
  Object.entries(summary)
    .filter(([path]) => path !== 'total')
    .map(([path, coverage]) => /** @type {[string, FileCoverage]} */ ([normalizeCoveragePath(path, repositoryRoot), exactCoverage(coverage)]))
    .sort(([left], [right]) => left.localeCompare(right))
)

/**
 * @param {{repositoryRoot: string, summaries: Record<string, Record<string, any>>, ownedPathsByProducer: Record<string, string[]>}} input
 */
export const createCombinedOwnedRuntimeReach = ({
  repositoryRoot,
  summaries,
  ownedPathsByProducer,
}) => {
  const normalized = Object.fromEntries(Object.entries(summaries).map(([producer, producerSummary]) => [
    producer,
    normalizeCoverageSummary(producerSummary, repositoryRoot),
  ]))
  const selected = Object.entries(ownedPathsByProducer).flatMap(([producer, paths]) =>
    paths.map((path) => normalized[producer]?.[path] ?? EMPTY_COVERAGE)
  )
  return sumCoverage(/** @type {FileCoverage[]} */ (selected))
}

/** @param {Record<string, any>} rawMap @param {string} repositoryRoot */
const normalizeCoverageMap = (rawMap, repositoryRoot) => Object.fromEntries(
  Object.entries(rawMap).map(([reportedPath, file]) => {
    const path = normalizeCoveragePath(file.path ?? reportedPath, repositoryRoot)
    return [path, { ...file, path }]
  }).sort(([left], [right]) => String(left).localeCompare(String(right)))
)

/**
 * @param {{repositoryRoot: string, summary: Record<string, any>, map: Record<string, any>, paths: string[]}} input
 */
export const createCoverageStabilitySnapshot = ({
  repositoryRoot,
  summary,
  map,
  paths,
}) => {
  const normalizedSummary = normalizeCoverageSummary(summary, repositoryRoot)
  const normalizedMap = normalizeCoverageMap(map, repositoryRoot)
  const orderedPaths = paths.slice().sort()
  const files = Object.fromEntries(orderedPaths.map((path) => {
    if (!normalizedSummary[path] || !normalizedMap[path]) {
      throw new Error(`${path}: missing from Storybook stability evidence`)
    }
    return [path, {
      coverage: normalizedSummary[path],
      map: normalizedMap[path],
    }]
  }))
  return {
    paths: orderedPaths,
    digest: createEvidenceDigest({ snapshot: JSON.stringify(stableValue(files)) }),
    files,
  }
}

/** @param {Record<string, any>} file */
const executableMap = (file) => stableValue({
  statementMap: file.statementMap,
  fnMap: file.fnMap,
  branchMap: file.branchMap,
})

/** @param {Record<string, any>} left @param {Record<string, any>} right */
const mergeFileCounters = (left, right) => ({
  ...left,
  s: Object.fromEntries(Object.keys(left.s).map((key) => [key, Math.max(left.s[key], right.s[key])])),
  f: Object.fromEntries(Object.keys(left.f).map((key) => [key, Math.max(left.f[key], right.f[key])])),
  b: Object.fromEntries(Object.keys(left.b).map((key) => [key,
    left.b[key].map((/** @type {number} */ hit, /** @type {number} */ index) => Math.max(hit, right.b[key][index])),
  ])),
})

/** @param {Record<string, any>} file */
const coverageFromMap = (file) => {
  const statementHits = /** @type {number[]} */ (Object.values(file.s))
  const functionHits = /** @type {number[]} */ (Object.values(file.f))
  const branchHits = /** @type {number[]} */ (Object.values(file.b).flat())
  /** @type {Map<number, number>} */
  const lineHits = new Map()
  for (const [key, hit] of Object.entries(file.s)) {
    const line = file.statementMap[key].start.line
    lineHits.set(line, Math.max(lineHits.get(line) ?? 0, /** @type {number} */ (hit)))
  }
  /** @param {number[]} hits */
  const tuple = (hits) => ({ covered: hits.filter((hit) => hit > 0).length, total: hits.length })
  return {
    statements: tuple(statementHits),
    branches: tuple(branchHits),
    functions: tuple(functionHits),
    lines: tuple([...lineHits.values()]),
  }
}

/**
 * Create the optional union of compatible Node and Storybook Istanbul maps.
 * Any overlapping file with different source or executable maps withholds the
 * complete view, while owner-specific verdicts remain independent.
 *
 * @param {{repositoryRoot: string, maps: Record<string, Record<string, any>>, sourceDigests: Record<string, Record<string, string>>}} input
 * @returns {{status: 'available', incompatibleFiles: Array<{path: string, reason: string}>, coverage: FileCoverage} | {status: 'withheld', incompatibleFiles: Array<{path: string, reason: string}>, coverage: undefined}}
 */
export const createCombinedAutomationReach = ({ repositoryRoot, maps, sourceDigests }) => {
  const normalized = Object.fromEntries(Object.entries(maps).map(([producer, map]) => [
    producer,
    normalizeCoverageMap(map, repositoryRoot),
  ]))
  const producers = Object.keys(normalized).sort()
  const paths = [...new Set(producers.flatMap((producer) => Object.keys(normalized[producer])))].sort()
  /** @type {Array<{path: string, reason: string}>} */
  const incompatibleFiles = []
  /** @type {FileCoverage[]} */
  const combined = []

  for (const path of paths) {
    const present = producers.filter((producer) => normalized[producer][path])
    if (present.length === 1) {
      combined.push(coverageFromMap(normalized[present[0]][path]))
      continue
    }
    const [first, ...others] = present
    const firstSourceDigest = sourceDigests[first]?.[path]
    if (!firstSourceDigest || others.some((producer) => !sourceDigests[producer]?.[path])) {
      incompatibleFiles.push({ path, reason: 'source digest is missing from producer evidence' })
      continue
    }
    if (others.some((producer) => sourceDigests[producer][path] !== firstSourceDigest)) {
      incompatibleFiles.push({ path, reason: 'source digest differs between producers' })
      continue
    }
    const firstExecutableMap = JSON.stringify(executableMap(normalized[first][path]))
    if (others.some((producer) => JSON.stringify(executableMap(normalized[producer][path])) !== firstExecutableMap)) {
      incompatibleFiles.push({ path, reason: 'executable maps differ between producers' })
      continue
    }
    const merged = others.reduce(
      (current, producer) => mergeFileCounters(current, normalized[producer][path]),
      normalized[first][path]
    )
    combined.push(coverageFromMap(merged))
  }

  if (incompatibleFiles.length > 0) {
    return { status: 'withheld', incompatibleFiles, coverage: undefined }
  }
  return { status: 'available', incompatibleFiles: [], coverage: sumCoverage(combined) }
}

/**
 * @param {{dirty: boolean, revisionChanged?: boolean, runDigests: string[], expectedRuns: number}} input
 */
export const stabilityAdmissionIssues = ({ dirty, revisionChanged = false, runDigests, expectedRuns }) => {
  const issues = []
  if (dirty) issues.push('Storybook stability admission requires a clean worktree')
  if (revisionChanged) issues.push('Storybook stability admission requires one unchanged revision')
  if (runDigests.length !== expectedRuns) {
    issues.push(`Storybook stability admission collected ${runDigests.length}/${expectedRuns} runs`)
  }
  if (new Set(runDigests).size > 1) {
    issues.push('Storybook controller coverage changed between collections')
  }
  return issues
}
