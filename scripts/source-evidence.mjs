import { relative, resolve, sep } from 'node:path'

/** @typedef {'logic-baseline' | 'storybook-ui' | 'e2e-bootstrap' | 'test-support' | 'type-only'} SourceEvidenceCategory */
/** @typedef {{category: SourceEvidenceCategory, rationale: string}} SourceClassification */
/** @typedef {'statements' | 'branches' | 'functions' | 'lines'} CoverageMetric */
/** @typedef {Record<CoverageMetric, {covered: number, total: number}>} FileCoverage */

const TEST_SOURCE_PATTERN = /\.(?:test|spec|stories)\.(?:[cm]?[jt]sx?)$/
const DECLARATION_PATTERN = /\.d\.[cm]?ts$/
/** @type {readonly CoverageMetric[]} */
const COVERAGE_METRICS = ['statements', 'branches', 'functions', 'lines']
export const CATEGORIES = /** @type {const} */ ([
  'logic-baseline',
  'storybook-ui',
  'e2e-bootstrap',
  'test-support',
  'type-only',
])

/** @type {Readonly<Record<string, string>>} */
export const UI_COMPONENT_EXEMPTIONS = Object.freeze({
  'frontend/src/todos/components/TodoRow.jsx':
    'Layout wrapper only; TodoItem and TodoComposer stories exercise it.',
})

/** @param {string} path @param {string} repositoryRoot */
const normalizePath = (path, repositoryRoot) =>
  relative(resolve(repositoryRoot), resolve(path)).split(sep).join('/')

/** @param {Record<string, any>} coverage @returns {FileCoverage} */
const exactCoverage = (coverage) => /** @type {FileCoverage} */ (Object.fromEntries(
  COVERAGE_METRICS.map((metric) => [metric, {
    covered: coverage[metric].covered,
    total: coverage[metric].total,
  }])
))

/** @param {FileCoverage[]} coverages @returns {FileCoverage} */
const sumCoverage = (coverages) => /** @type {FileCoverage} */ (Object.fromEntries(COVERAGE_METRICS.map((metric) => [
  metric,
  coverages.reduce((sum, coverage) => ({
    covered: sum.covered + coverage[metric].covered,
    total: sum.total + coverage[metric].total,
  }), { covered: 0, total: 0 }),
])))

/** @param {string} path */
const componentStoryPath = (path) => path === 'frontend/src/theme.js'
  ? undefined
  : path.replace(/\.jsx$/, '.stories.jsx')

/** @param {string} source */
const declaredStoryCounts = (source) => ({
  stories: source.match(/\bexport\s+const\s+[A-Za-z_$][\w$]*\s*=/g)?.length ?? 0,
  plays: source.match(/\bplay\s*:\s*async\b/g)?.length ?? 0,
})

/**
 * Classify a repository-relative source path by the evidence seam that owns it.
 * Test and story sources are evidence, not subjects, and therefore return undefined.
 *
 * @param {string} path
 * @returns {SourceClassification | undefined}
 */
export const classifySourcePath = (path) => {
  if (TEST_SOURCE_PATTERN.test(path)) return undefined

  if (path === 'shared/src/types.js') {
    return { category: 'type-only', rationale: 'JSDoc declarations with no runtime code' }
  }
  // A declaration file emits nothing, so there is no execution to evidence. This
  // is a rule rather than a path list because it holds for any `.d.ts` by
  // construction, and the alternative is a new exemption per file.
  if (DECLARATION_PATTERN.test(path)) {
    return { category: 'type-only', rationale: 'ambient declarations with no runtime code' }
  }
  if (path === 'backend/src/index.js' || path === 'frontend/src/index.jsx') {
    return { category: 'e2e-bootstrap', rationale: 'process or DOM bootstrap exercised by Playwright' }
  }
  if (path === 'frontend/src/testing/storyHarness.jsx') {
    return { category: 'test-support', rationale: 'Storybook-only composition harness' }
  }
  if (
    path === 'frontend/src/App.jsx' ||
    path === 'frontend/src/theme.js' ||
    /^frontend\/src\/todos\/components\/.*\.jsx$/.test(path)
  ) {
    return { category: 'storybook-ui', rationale: 'rendered and exercised by Storybook in Chromium' }
  }
  if (
    /^shared\/src\/.*\.js$/.test(path) ||
    /^backend\/src\/.*\.js$/.test(path) ||
    /^frontend\/src\/todos\/.*\.js$/.test(path) ||
    /^frontend\/src\/testing\/[^/]+\.js$/.test(path)
  ) {
    return { category: 'logic-baseline', rationale: 'exact per-file unit and Storybook coverage baseline' }
  }
  return undefined
}

/**
 * Account for every production source and join Storybook UI files to their
 * declared stories, executed browser tests, and informational coverage.
 *
 * @param {{sourcePaths: string[], baselinePaths: string[], summary: Record<string, any>, repositoryRoot: string, storySources: Record<string, string>, storyResults: {testResults?: Array<{name: string, assertionResults?: Array<{status?: string}>}>}}} input
 * @returns {{verdict: 'pass' | 'fail', issues: string[], categoryCounts: Record<string, number>, sources: Array<{path: string, category?: SourceEvidenceCategory, rationale?: string}>, ui: Array<{path: string, evidence: string, declaredStories: number, declaredPlays: number, executedStories: number, coverage?: FileCoverage}>, uiTotals: FileCoverage}}
 */
export const createSourceEvidence = ({
  sourcePaths,
  baselinePaths,
  summary,
  repositoryRoot,
  storySources,
  storyResults,
}) => {
  const issues = []
  const sources = sourcePaths.slice().sort().map((path) => {
    const classification = classifySourcePath(path)
    if (!classification) issues.push(`${path}: no evidence category`)
    return { path, ...classification }
  })
  const categoryCounts = Object.fromEntries(CATEGORIES.map((category) => [
    category,
    sources.filter((source) => source.category === category).length,
  ]))

  const logicPaths = sources
    .filter(({ category }) => category === 'logic-baseline')
    .map(({ path }) => path)
  const baselineSet = new Set(baselinePaths)
  for (const path of logicPaths) {
    if (!baselineSet.has(path)) issues.push(`${path}: logic source is absent from the exact baseline`)
  }
  for (const path of baselineSet) {
    if (!logicPaths.includes(path)) issues.push(`${path}: baseline entry is not classified as logic`)
  }

  const summaryFiles = Object.fromEntries(Object.entries(summary)
    .filter(([path]) => path !== 'total')
    .map(([path, value]) => [normalizePath(path, repositoryRoot), value]))
  const executedByStoryFile = Object.fromEntries((storyResults.testResults ?? []).map((result) => [
    normalizePath(result.name, repositoryRoot),
    result.assertionResults ?? [],
  ]))

  const ui = sources
    .filter(({ category }) => category === 'storybook-ui')
    .map(({ path }) => {
      const storyPath = componentStoryPath(path)
      const exemption = UI_COMPONENT_EXEMPTIONS[path]
      const evidence = storyPath ?? 'frontend/.storybook/preview.jsx'
      const source = storyPath ? storySources[storyPath] : undefined
      const counts = source ? declaredStoryCounts(source) : { stories: 0, plays: 0 }
      const executed = storyPath ? executedByStoryFile[storyPath] ?? [] : []
      if (storyPath && !source && !exemption) issues.push(`${path}: no story or reviewed exemption`)
      if (source && executed.length !== counts.stories) {
        issues.push(`${storyPath}: declared ${counts.stories} stories but executed ${executed.length}`)
      }
      if (executed.some(({ status }) => status !== 'passed')) {
        issues.push(`${storyPath}: not every story passed in Chromium`)
      }
      const rawCoverage = summaryFiles[path]
      if (!rawCoverage) issues.push(`${path}: missing informational UI coverage`)
      return {
        path,
        evidence: exemption ? `Exemption: ${exemption}` : evidence,
        declaredStories: counts.stories,
        declaredPlays: counts.plays,
        executedStories: executed.length,
        coverage: rawCoverage ? exactCoverage(rawCoverage) : undefined,
      }
    })

  return {
    verdict: issues.length === 0 ? 'pass' : 'fail',
    issues,
    categoryCounts,
    sources,
    ui,
    uiTotals: sumCoverage(ui.flatMap(({ coverage }) => coverage ? [coverage] : [])),
  }
}
