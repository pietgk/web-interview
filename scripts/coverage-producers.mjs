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

const EXECUTABLE_MAP_SAMPLE_LIMIT = 3
const ALIGNMENT_GAP_COST = 2
const ALIGNMENT_DIFFERENT_LINE_COST = 3

/** @param {string} left @param {string} right */
const compareCounterIds = (left, right) => {
  const leftNumber = Number(left)
  const rightNumber = Number(right)
  if (Number.isInteger(leftNumber) && Number.isInteger(rightNumber)) return leftNumber - rightNumber
  return left.localeCompare(right)
}

/** @param {Record<string, any>} map */
const orderedMapEntries = (map) => Object.entries(map ?? {})
  .sort(([left], [right]) => compareCounterIds(left, right))

/** @param {'statements' | 'functions' | 'branches'} kind @param {Record<string, any>} entry */
const diagnosticLocation = (kind, entry) => kind === 'statements' ? entry : entry.loc

/** @param {unknown} left @param {unknown} right */
const exactEntryMatch = (left, right) =>
  JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right))

/**
 * Alignment is diagnostic only. Exact complete-map equality remains the compatibility rule.
 * Source-line spans let the report recognize a generated insertion without treating every
 * subsequent counter-id shift as a separate structural change.
 *
 * @param {'statements' | 'functions' | 'branches'} kind
 * @param {Record<string, any>} left
 * @param {Record<string, any>} right
 */
const alignMapEntries = (kind, left, right) => {
  const leftEntries = orderedMapEntries(left)
  const rightEntries = orderedMapEntries(right)
  const rows = leftEntries.length + 1
  const columns = rightEntries.length + 1
  const costs = Array.from({ length: rows }, () => Array(columns).fill(0))
  for (let leftIndex = 0; leftIndex < rows; leftIndex += 1) {
    costs[leftIndex][0] = leftIndex * ALIGNMENT_GAP_COST
  }
  for (let rightIndex = 0; rightIndex < columns; rightIndex += 1) {
    costs[0][rightIndex] = rightIndex * ALIGNMENT_GAP_COST
  }

  /** @param {Record<string, any>} leftEntry @param {Record<string, any>} rightEntry */
  const replacementCost = (leftEntry, rightEntry) => {
    if (exactEntryMatch(leftEntry, rightEntry)) return 0
    const leftLocation = diagnosticLocation(kind, leftEntry)
    const rightLocation = diagnosticLocation(kind, rightEntry)
    return leftLocation?.start?.line === rightLocation?.start?.line &&
      leftLocation?.end?.line === rightLocation?.end?.line
      ? 1
      : ALIGNMENT_DIFFERENT_LINE_COST
  }

  for (let leftIndex = 1; leftIndex < rows; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex < columns; rightIndex += 1) {
      costs[leftIndex][rightIndex] = Math.min(
        costs[leftIndex - 1][rightIndex - 1] + replacementCost(
          leftEntries[leftIndex - 1][1],
          rightEntries[rightIndex - 1][1]
        ),
        costs[leftIndex - 1][rightIndex] + ALIGNMENT_GAP_COST,
        costs[leftIndex][rightIndex - 1] + ALIGNMENT_GAP_COST
      )
    }
  }

  const reversed = []
  let leftIndex = leftEntries.length
  let rightIndex = rightEntries.length
  while (leftIndex > 0 || rightIndex > 0) {
    const replacement = leftIndex > 0 && rightIndex > 0
      ? costs[leftIndex - 1][rightIndex - 1] + replacementCost(
        leftEntries[leftIndex - 1][1],
        rightEntries[rightIndex - 1][1]
      )
      : Number.POSITIVE_INFINITY
    if (replacement === costs[leftIndex][rightIndex]) {
      reversed.push({ left: leftEntries[leftIndex - 1], right: rightEntries[rightIndex - 1] })
      leftIndex -= 1
      rightIndex -= 1
      continue
    }
    if (leftIndex > 0 && costs[leftIndex - 1][rightIndex] + ALIGNMENT_GAP_COST === costs[leftIndex][rightIndex]) {
      reversed.push({ left: leftEntries[leftIndex - 1] })
      leftIndex -= 1
      continue
    }
    reversed.push({ right: rightEntries[rightIndex - 1] })
    rightIndex -= 1
  }
  return reversed.reverse()
}

/**
 * Produce bounded diagnostics for two complete Istanbul executable maps.
 * This comparison explains incompatibility but never changes the exact-match verdict.
 *
 * @param {{node: Record<string, any>, storybook: Record<string, any>, sampleLimit?: number}} input
 */
export const compareExecutableMaps = ({
  node,
  storybook,
  sampleLimit = EXECUTABLE_MAP_SAMPLE_LIMIT,
}) => {
  const mapDefinitions = [
    ['statements', 'statementMap'],
    ['functions', 'fnMap'],
    ['branches', 'branchMap'],
  ]
  const maps = Object.fromEntries(mapDefinitions.map(([kind, property]) => {
    const nodeMap = node[property] ?? {}
    const storybookMap = storybook[property] ?? {}
    /** @type {any[]} */
    const differences = []
    for (const { left, right } of alignMapEntries(
      /** @type {'statements' | 'functions' | 'branches'} */ (kind),
      nodeMap,
      storybookMap
    )) {
      if (left && right && exactEntryMatch(left[1], right[1])) continue
      if (left && right) {
        differences.push({
          kind: 'different',
          counters: { node: left[0], storybook: right[0] },
          locations: {
            node: diagnosticLocation(/** @type {any} */ (kind), left[1]),
            storybook: diagnosticLocation(/** @type {any} */ (kind), right[1]),
          },
        })
        continue
      }
      const producer = left ? 'node' : 'storybook'
      const [counter, entry] = /** @type {[string, Record<string, any>]} */ (left ?? right)
      differences.push({
        kind: 'only',
        producer,
        counter,
        location: diagnosticLocation(/** @type {any} */ (kind), entry),
      })
    }
    return [kind, {
      entryCounts: {
        node: Object.keys(nodeMap).length,
        storybook: Object.keys(storybookMap).length,
      },
      differingEntries: differences.filter(({ kind: differenceKind }) => differenceKind === 'different').length,
      onlyIn: {
        node: differences.filter((difference) => difference.kind === 'only' && difference.producer === 'node').length,
        storybook: differences.filter((difference) => difference.kind === 'only' && difference.producer === 'storybook').length,
      },
      samples: differences.slice(0, sampleLimit),
      omittedSamples: Math.max(0, differences.length - sampleLimit),
    }]
  }))
  return {
    exactMatch: JSON.stringify(executableMap(node)) === JSON.stringify(executableMap(storybook)),
    maps,
  }
}

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
 * @returns {{status: 'available', incompatibleFiles: any[], coverage: FileCoverage} | {status: 'withheld', incompatibleFiles: any[], coverage: undefined}}
 */
export const createCombinedAutomationReach = ({ repositoryRoot, maps, sourceDigests }) => {
  const normalized = Object.fromEntries(Object.entries(maps).map(([producer, map]) => [
    producer,
    normalizeCoverageMap(map, repositoryRoot),
  ]))
  const producers = Object.keys(normalized).sort()
  const paths = [...new Set(producers.flatMap((producer) => Object.keys(normalized[producer])))].sort()
  /** @type {any[]} */
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
      incompatibleFiles.push({
        path,
        reason: 'source digest is missing from producer evidence',
        sourceDigest: { status: 'missing' },
      })
      continue
    }
    if (others.some((producer) => sourceDigests[producer][path] !== firstSourceDigest)) {
      incompatibleFiles.push({
        path,
        reason: 'source digest differs between producers',
        sourceDigest: { status: 'differs' },
      })
      continue
    }
    const executableMaps = compareExecutableMaps({
      node: normalized.node[path],
      storybook: normalized.storybook[path],
    })
    if (!executableMaps.exactMatch) {
      incompatibleFiles.push({
        path,
        reason: 'executable maps differ between producers',
        sourceDigest: { status: 'matches' },
        executableMaps,
      })
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
