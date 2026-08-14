import { execFile } from 'node:child_process'
import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import {
  createOwnerCoverageBaseline,
  evaluateOwnerCoverage,
  ownershipReviewIssues,
  providerReviewIssues,
  renderCoverageHtml,
  renderCoverageMarkdown,
} from './coverage-evidence.ts'
import { removeWithheldCombinedExplorer } from './coverage-artifacts.ts'
import {
  createCombinedAutomationReach,
  createEvidenceDigest,
  EXPECTED_COMBINED_AUTOMATION_OVERLAP_FILES,
  normalizeCoveragePath,
  PRODUCER_CONFIG_PATHS,
  resolveCoverageProviderProvenance,
  validateProducerManifest,
} from './coverage-producers.ts'
import type {
  CoverageProvider,
  IstanbulFile,
  ProducerManifest,
  ProducerPair,
  RawCoverageSummary,
} from './coverage-producers.ts'
import {
  exactCoveragePathsFor,
  SOURCE_EVIDENCE_ENTRIES,
} from './source-evidence-registry.ts'
import { createSourceEvidence } from './source-evidence.ts'
import { ROOT } from './stages.ts'

const execFileAsync = promisify(execFile)
const BASELINE_PATH = resolve(ROOT, 'coverage-baseline.json')
const MARKDOWN_PATH = resolve(ROOT, 'coverage/summary.md')
const HTML_PATH = resolve(ROOT, 'coverage/report.html')
const EVIDENCE_SUMMARY_PATH = resolve(ROOT, 'coverage/evidence-summary.json')
const STORY_RESULTS_PATH = resolve(ROOT, '.test-evidence/storybook.json')
const VALID_MODES = new Set(['check', 'update-baseline'])
const PRODUCERS: readonly ('node' | 'storybook')[] = Object.freeze(['node', 'storybook'])
const producerPair = <T>(read: (producer: 'node' | 'storybook') => T): ProducerPair<T> => ({
  node: read('node'),
  storybook: read('storybook'),
})

const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8'))

const normalizePath = (path: string) => normalizeCoveragePath(path, ROOT)

const filesUnder = async (directory: string): Promise<string[]> => (await Promise.all(
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
  const relativeFiles = absoluteFiles.map(normalizePath).sort()
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

const sourceState = async () => {
  const [{ stdout: revision }, { stdout: status }] = await Promise.all([
    execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }),
    execFileAsync('git', ['status', '--porcelain'], { cwd: ROOT }),
  ])
  return { revision: revision.trim(), dirty: status.trim().length > 0 }
}

const readProducerEvidence = async (
  producer: 'node' | 'storybook',
  currentState: {revision: string, dirty: boolean},
  currentCoverageProvider: CoverageProvider
) => {
  const directory = resolve(ROOT, '.coverage-reports', producer)
  const [rawSummary, rawMap, rawManifest] = await Promise.all([
    readJson(resolve(directory, 'coverage-summary.json')),
    readJson(resolve(directory, 'coverage-final.json')),
    readJson(resolve(directory, 'producer-evidence.json')),
  ])
  const summary = rawSummary as RawCoverageSummary
  const map = rawMap as Record<string, IstanbulFile>
  const manifest = rawManifest as ProducerManifest
  const sourcePaths = [...new Set(Object.entries(map).map(([reportedPath, file]) =>
    normalizePath(file.path ?? reportedPath)
  ))].sort()
  const configPaths = PRODUCER_CONFIG_PATHS[producer]
  const inputPaths = [...sourcePaths, ...configPaths].sort()
  const inputContents = Object.fromEntries(await Promise.all(inputPaths.map(async (path) => [
    path,
    await readFile(resolve(ROOT, path), 'utf8'),
  ])))
  const issues = validateProducerManifest({
    producer,
    manifest,
    ...currentState,
    currentInputDigest: createEvidenceDigest(inputContents),
    currentCoverageProvider,
  })
  if (JSON.stringify(sourcePaths) !== JSON.stringify(manifest.sourcePaths)) {
    issues.push(`${producer} coverage map source set does not match its manifest`)
  }
  if (JSON.stringify(configPaths) !== JSON.stringify(manifest.configPaths)) {
    issues.push(`${producer} coverage configuration set does not match its manifest`)
  }
  return { summary, map, manifest, issues }
}

const writeReports = async (evaluation: ReturnType<typeof evaluateOwnerCoverage>) => {
  const markdown = renderCoverageMarkdown(evaluation)
  const evidenceSummary = {
    verdict: evaluation.verdict,
    nodeOwnedRuntime: evaluation.owners.node.global,
    storybookController: evaluation.owners.storybook.global,
    storybookRenderedUi: evaluation.sourceEvidence?.uiTotals,
    combinedOwnedRuntime: evaluation.combinedOwnedRuntime,
    combinedAutomation: evaluation.combinedAutomation,
    coverageProviders: evaluation.provenance.coverageProviders,
  }
  await mkdir(resolve(ROOT, 'coverage'), { recursive: true })
  await Promise.all([
    writeFile(MARKDOWN_PATH, markdown),
    writeFile(HTML_PATH, renderCoverageHtml(evaluation)),
    writeFile(EVIDENCE_SUMMARY_PATH, `${JSON.stringify(evidenceSummary, null, 2)}\n`),
  ])
  if (process.env['GITHUB_STEP_SUMMARY']) {
    await appendFile(process.env['GITHUB_STEP_SUMMARY'], markdown)
  }
}

const main = async () => {
  const requestedMode = process.env['COVERAGE_EVIDENCE_MODE'] ?? 'check'
  if (!VALID_MODES.has(requestedMode)) throw new Error(`Unknown coverage evidence mode: ${requestedMode}`)
  const mode: 'check' | 'update-baseline' = (requestedMode as 'check' | 'update-baseline')
  const ownershipReviewed = process.env['COVERAGE_EVIDENCE_REVIEW_OWNERSHIP'] === '1'
  const providerReviewed = process.env['COVERAGE_EVIDENCE_REVIEW_PROVIDER'] === '1'
  const [rawBaselineJson, rawStoryResults, sources, currentState] = await Promise.all([
    readJson(BASELINE_PATH),
    readJson(STORY_RESULTS_PATH),
    sourceInputs(),
    sourceState(),
  ])
  type OwnerBaseline = ReturnType<typeof createOwnerCoverageBaseline>
  type CoverageBaseline = {
    schemaVersion?: number
    registryDigest?: string
    coverageProviders?: Record<string, CoverageProvider>
    owners: OwnerBaseline['owners']
  }
  const storyResults = rawStoryResults as {
    testResults?: Array<{name: string, assertionResults?: Array<{status?: string}>}>
  }
  let baseline = rawBaselineJson as CoverageBaseline
  const [nodeInstalled, storybookInstalled] = await Promise.all([
    resolveCoverageProviderProvenance('node', ROOT),
    resolveCoverageProviderProvenance('storybook', ROOT),
  ])
  const installedProviders = { node: nodeInstalled, storybook: storybookInstalled }
  const coverageProviders = producerPair((producer) => installedProviders[producer].coverageProvider)
  const [nodeEvidence, storybookEvidence] = await Promise.all([
    readProducerEvidence('node', currentState, coverageProviders.node),
    readProducerEvidence('storybook', currentState, coverageProviders.storybook),
  ])
  const producerEvidence = { node: nodeEvidence, storybook: storybookEvidence }
  const summaries = producerPair((producer) => producerEvidence[producer].summary)
  const maps = producerPair((producer) => producerEvidence[producer].map)
  const sourceDigests = producerPair((producer) => producerEvidence[producer].manifest.sourceDigests ?? {})
  const capturedCoverageProviders = producerPair((producer) => producerEvidence[producer].manifest.coverageProvider)
  const producerIssues = PRODUCERS.flatMap((producer) => [
    ...installedProviders[producer].issues,
    ...producerEvidence[producer].issues,
  ])
  const ownedPathsByProducer = producerPair((producer) => exactCoveragePathsFor(producer))
  const registryDigest = createEvidenceDigest({
    registry: JSON.stringify(SOURCE_EVIDENCE_ENTRIES),
  })

  if (baseline.schemaVersion === 1) {
    if (mode !== 'update-baseline' || !ownershipReviewed) {
      throw new Error('The merged baseline must be migrated with reviewed ownership before producer-owned coverage can be checked')
    }
  } else if (baseline.schemaVersion !== 2 && baseline.schemaVersion !== 3) {
    throw new Error(`Unsupported coverage baseline schema: ${baseline.schemaVersion ?? 'missing'}`)
  }
  if (baseline.schemaVersion >= 2) {
    const ownershipIssues = ownershipReviewIssues({
      baselineRegistryDigest: baseline.registryDigest ?? '',
      currentRegistryDigest: registryDigest,
      ownershipReviewed,
    })
    if (ownershipIssues.length > 0) throw new Error(ownershipIssues[0])
  }
  const baselineProviderIssues = providerReviewIssues({
    baselineCoverageProviders: baseline.coverageProviders,
    currentCoverageProviders: coverageProviders,
    mode,
    providerReviewed,
  })
  if (baselineProviderIssues.length > 0) throw new Error(baselineProviderIssues[0])
  const providerContractChanged = providerReviewIssues({
    baselineCoverageProviders: baseline.coverageProviders,
    currentCoverageProviders: coverageProviders,
    mode: 'check',
    providerReviewed: false,
  }).length > 0
  if (baseline.schemaVersion !== 3 || providerContractChanged) {
    baseline = createOwnerCoverageBaseline({
      summaries,
      repositoryRoot: ROOT,
      ownedPathsByProducer,
      registryDigest,
      coverageProviders,
    })
  }

  const combinedAutomation = createCombinedAutomationReach({
    repositoryRoot: ROOT,
    maps,
    sourceDigests,
    coverageProviders: capturedCoverageProviders,
    expectedOverlapFiles: EXPECTED_COMBINED_AUTOMATION_OVERLAP_FILES,
  })
  await removeWithheldCombinedExplorer({
    coverageDirectory: resolve(ROOT, 'coverage'),
    combinedAutomation,
  })
  let evaluation = evaluateOwnerCoverage({
    summaries,
    baseline,
    repositoryRoot: ROOT,
    ownedPathsByProducer,
    mode,
    allowFileSetChanges: ownershipReviewed,
    producerIssues,
    combinedAutomation,
  })
  let baselineToWrite
  if (mode === 'update-baseline' && evaluation.verdict === 'pass') {
    baselineToWrite = createOwnerCoverageBaseline({
      summaries,
      repositoryRoot: ROOT,
      ownedPathsByProducer,
      registryDigest,
      coverageProviders,
    })
    baseline = baselineToWrite
  }

  const sourceEvidence = createSourceEvidence({
    ...sources,
    baselinePathsByProducer: Object.fromEntries(PRODUCERS.map((producer) => [
      producer,
      Object.keys(baseline.owners[producer].files),
    ])),
    summary: summaries.storybook,
    repositoryRoot: ROOT,
    storyResults,
  })
  evaluation = evaluateOwnerCoverage({
    summaries,
    baseline,
    repositoryRoot: ROOT,
    ownedPathsByProducer,
    mode: 'check',
    producerIssues,
    sourceEvidence,
    combinedAutomation,
    provenance: {
      ...currentState,
      generatedAt: new Date().toISOString(),
      scope: 'producer-owned coverage evidence',
      coverageProviders,
    },
  })
  await writeReports(evaluation)

  if (baselineToWrite && evaluation.verdict === 'pass') {
    await writeFile(BASELINE_PATH, `${JSON.stringify(baselineToWrite, null, 2)}\n`)
  }

  if (evaluation.verdict === 'fail') {
    const ownerDetails = Object.entries(evaluation.owners).flatMap(([producer, owner]) =>
      owner.changes.map(({ path, status, outcome }) => `${producer}: ${path}: ${status} (${outcome})`)
    )
    const details = [
      ...producerIssues,
      ...sourceEvidence.issues,
      ...ownerDetails,
    ].join('\n')
    process.stderr.write(`Producer-owned coverage evidence does not match the committed baselines.\n${details}\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write(mode === 'update-baseline'
    ? 'Producer-owned coverage baselines updated without regressions.\n'
    : 'Producer-owned coverage evidence exactly matches the committed baselines.\n')
}

await main()
