import {
  exactCoverage,
  normalizeCoveragePath,
  sumCoverage,
} from './coverage-producers.js'
import {
  evidenceForSourcePath,
  SOURCE_EVIDENCE_ENTRIES,
  TREATMENTS,
  validateSourceEvidenceRegistry,
} from './source-evidence-registry.js'

/** @typedef {keyof typeof TREATMENTS} SourceEvidenceCategory */
/** @typedef {{treatment: SourceEvidenceCategory, producer: string, verdict: string, rationale: string}} SourceClassification */
/** @typedef {'statements' | 'branches' | 'functions' | 'lines'} CoverageMetric */
/** @typedef {Record<CoverageMetric, {covered: number, total: number}>} FileCoverage */

const TEST_SOURCE_PATTERN = /\.(?:test|spec|stories)\.(?:[cm]?[jt]sx?)$/
export const CATEGORIES = Object.freeze(Object.keys(TREATMENTS))

/** @type {Readonly<Record<string, string>>} */
export const UI_COMPONENT_EXEMPTIONS = Object.freeze({
  'frontend/src/todos/components/TodoRow.jsx':
    'Layout wrapper only; TodoItem and TodoComposer stories exercise it.',
  'frontend/src/todos/components/focusLeft.js':
    'DOM focus helper exercised through the TodoComposer story interactions.',
})

/** @param {string} path */
const componentStoryPath = (path) => path.replace(/\.(?:jsx|js)$/, '.stories.jsx')

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
  const entry = evidenceForSourcePath(path)
  if (!entry) return undefined
  const definition = TREATMENTS[entry.treatment]
  return {
    treatment: entry.treatment,
    producer: definition.producer,
    verdict: definition.verdict,
    rationale: entry.rationale,
  }
}

/**
 * Account for every production source and join Storybook UI files to their
 * declared stories, executed browser tests, and informational coverage.
 *
 * @param {{sourcePaths: string[], registryEntries?: typeof SOURCE_EVIDENCE_ENTRIES, baselinePathsByProducer: Record<string, string[]>, summary: Record<string, any>, repositoryRoot: string, storySources: Record<string, string>, storyResults: {testResults?: Array<{name: string, assertionResults?: Array<{status?: string}>}>}}} input
 * @returns {{verdict: 'pass' | 'fail', issues: string[], categoryCounts: Record<string, number>, sources: Array<{path: string, treatment?: SourceEvidenceCategory, producer?: string, verdict?: string, rationale?: string}>, ui: Array<{path: string, evidence: string, declaredStories: number, declaredPlays: number, executedStories: number, coverage?: FileCoverage}>, uiTotals: FileCoverage}}
 */
export const createSourceEvidence = ({
  sourcePaths,
  registryEntries = SOURCE_EVIDENCE_ENTRIES,
  baselinePathsByProducer,
  summary,
  repositoryRoot,
  storySources,
  storyResults,
}) => {
  const issues = validateSourceEvidenceRegistry({ entries: registryEntries, sourcePaths })
  const registry = new Map(registryEntries.map((entry) => [entry.path, entry]))
  /** @type {Array<{path: string, treatment?: SourceEvidenceCategory, producer?: string, verdict?: string, rationale?: string}>} */
  const sources = sourcePaths.slice().sort().map((path) => {
    const entry = registry.get(path)
    if (!entry) return { path, treatment: undefined, producer: undefined, verdict: undefined, rationale: undefined }
    const definition = TREATMENTS[entry.treatment]
    if (!definition) return { path, treatment: entry.treatment, producer: undefined, verdict: undefined, rationale: entry.rationale }
    return { path, treatment: entry.treatment, ...definition, rationale: entry.rationale }
  })
  const categoryCounts = Object.fromEntries(CATEGORIES.map((category) => [
    category,
    sources.filter((source) => source.treatment === category).length,
  ]))

  for (const producer of ['node', 'storybook']) {
    const ownedPaths = sources
      .filter((source) => source.producer === producer && source.verdict === 'exact-coverage')
      .map(({ path }) => path)
    const baselineSet = new Set(baselinePathsByProducer[producer] ?? [])
    for (const path of ownedPaths) {
      if (!baselineSet.has(path)) {
        issues.push(`${path}: ${producer}-owned source is absent from the ${producer} exact baseline`)
      }
    }
    for (const path of baselineSet) {
      const source = sources.find((candidate) => candidate.path === path)
      if (source?.producer !== producer) {
        issues.push(`${path}: ${producer} baseline entry is not owned by ${producer}`)
      } else if (source.verdict !== 'exact-coverage') {
        issues.push(`${path}: ${producer} baseline entry does not allow exact coverage`)
      }
    }
  }

  const summaryFiles = Object.fromEntries(Object.entries(summary)
    .filter(([path]) => path !== 'total')
    .map(([path, value]) => [normalizeCoveragePath(path, repositoryRoot), value]))
  const executedByStoryFile = Object.fromEntries((storyResults.testResults ?? []).map((result) => [
    normalizeCoveragePath(result.name, repositoryRoot),
    result.assertionResults ?? [],
  ]))

  const ui = sources
    .filter(({ treatment }) => treatment === 'rendered-ui')
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
        coverage: rawCoverage ? /** @type {FileCoverage} */ (exactCoverage(rawCoverage)) : undefined,
      }
    })

  return {
    verdict: issues.length === 0 ? 'pass' : 'fail',
    issues,
    categoryCounts,
    sources,
    ui,
    uiTotals: /** @type {FileCoverage} */ (sumCoverage(ui.flatMap(({ coverage }) => coverage ? [coverage] : []))),
  }
}
