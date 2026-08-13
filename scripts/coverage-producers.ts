import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'

export type CoverageMetric = 'statements' | 'branches' | 'functions' | 'lines'
export type CoverageCount = { covered: number; total: number }
export type FileCoverage = {
  statements: CoverageCount
  branches: CoverageCount
  functions: CoverageCount
  lines: CoverageCount
}

/** Where a counter sits in the original source, as Istanbul records it. */
export type SourcePosition = { line: number; column?: number | null }
export type SourceSpan = { start?: SourcePosition; end?: SourcePosition }

/**
 * An entry in one of Istanbul's executable maps. Statement entries carry the
 * span directly; function and branch entries nest it under `loc`.
 */
export type CounterMapEntry = SourceSpan & {
  loc?: SourceSpan
  name?: string
  decl?: SourceSpan
  line?: number
  type?: string
  locations?: SourceSpan[]
}

/** The fields this module reads out of an Istanbul per-file coverage object. */
export type IstanbulFile = {
  path?: string
  statementMap?: Record<string, CounterMapEntry>
  fnMap?: Record<string, CounterMapEntry>
  branchMap?: Record<string, CounterMapEntry>
  s?: Record<string, number>
  f?: Record<string, number>
  b?: Record<string, number[]>
}

export type CounterKind = 'statements' | 'functions' | 'branches'

/** One explained difference between the two producers' executable maps. */
export type CounterDifference =
  | {
      kind: 'different'
      counters: { node: string; storybook: string }
      locations: { node: SourceSpan | undefined; storybook: SourceSpan | undefined }
    }
  | { kind: 'only'; producer: string; counter: string; location: SourceSpan | undefined }

/** A coverage summary as the providers emit it, before normalisation. */
export type RawCoverageSummary = Record<string, FileCoverage>

/** The fields this module reads out of a package.json. */
export type PackageManifest = {
  name?: string | undefined
  version?: string | undefined
  devDependencies?: Record<string, string> | undefined
}

export type CoverageProducer = 'node' | 'storybook'
export type ProducerPair<T> = { node: T, storybook: T }

export type CoverageProvider = {
  name?: string | undefined
  package?: string | undefined
  version?: string | undefined
}

export type ProducerManifest = {
  schemaVersion?: number
  producer?: string
  coverageProvider?: CoverageProvider
  revision?: string
  dirty?: boolean
  inputDigest?: string
  sourcePaths?: string[]
  configPaths?: string[]
  sourceDigests?: Record<string, string>
}

export type ExecutableMapDiagnostic = {
  entryCounts: { node: number; storybook: number }
  differingEntries: number
  onlyIn: { node: number; storybook: number }
  samples: CounterDifference[]
  omittedSamples: number
}

export type ExecutableMapsComparison = {
  exactMatch: boolean
  maps: {
    statements: ExecutableMapDiagnostic
    functions: ExecutableMapDiagnostic
    branches: ExecutableMapDiagnostic
  }
}

export type IncompatibleFile = {
  path: string
  reason: string
  sourceDigest: { status: string }
  executableMaps?: ExecutableMapsComparison
}

export type CombinedAutomationReach =
  | {
      status: 'available'
      incompatibleFiles: IncompatibleFile[]
      providerIssues: string[]
      admissionIssues: string[]
      coverage: FileCoverage
    }
  | {
      status: 'withheld'
      incompatibleFiles: IncompatibleFile[]
      providerIssues: string[]
      admissionIssues: string[]
      coverage: undefined
    }

export const COVERAGE_METRICS: readonly CoverageMetric[] = Object.freeze([
  'statements',
  'branches',
  'functions',
  'lines',
])

export const COVERAGE_PROVIDER = Object.freeze({
  name: 'istanbul',
  package: '@vitest/coverage-istanbul',
  version: '4.1.10',
})

export const EXPECTED_COMBINED_AUTOMATION_OVERLAP_FILES = 13

export const coverageProviderProvenanceFromPackage = (installedPackageManifest: PackageManifest): CoverageProvider => ({
  name: COVERAGE_PROVIDER.name,
  package: installedPackageManifest.name,
  version: installedPackageManifest.version,
})

export const coverageProviderInstallationIssues = ({
  producer,
  packageManifest,
  installedPackageManifest,
}: {
  producer: string
  packageManifest: PackageManifest
  installedPackageManifest: PackageManifest
}) => {
  const issues: string[] = []
  if (packageManifest.devDependencies?.[COVERAGE_PROVIDER.package] !== COVERAGE_PROVIDER.version) {
    issues.push(`${producer} package manifest must declare ${COVERAGE_PROVIDER.package} at exactly ${COVERAGE_PROVIDER.version}`)
  }
  if (installedPackageManifest.name !== COVERAGE_PROVIDER.package || installedPackageManifest.version !== COVERAGE_PROVIDER.version) {
    issues.push(`${producer} installed coverage provider must resolve ${COVERAGE_PROVIDER.package} at exactly ${COVERAGE_PROVIDER.version}`)
  }
  return issues
}

export const PRODUCER_CONFIG_PATHS = Object.freeze({
  node: Object.freeze([
    'package.json',
    'package-lock.json',
    'vitest.config.ts',
    'shared/vitest.config.ts',
    'backend/vitest.config.ts',
    'frontend/vitest.logic.config.ts',
    'scripts/vitest.config.ts',
  ]),
  storybook: Object.freeze([
    'frontend/package.json',
    'frontend/package-lock.json',
    'frontend/vitest.storybook.config.ts',
    'frontend/vite.config.ts',
    'frontend/.storybook/main.ts',
    'frontend/.storybook/preview.tsx',
  ]),
})

const PRODUCER_PACKAGE_PATHS = Object.freeze({
  node: 'package.json',
  storybook: 'frontend/package.json',
})

export const resolveCoverageProviderProvenance = async (
  producer: 'node' | 'storybook',
  repositoryRoot: string
) => {
  const packagePath = resolve(repositoryRoot, PRODUCER_PACKAGE_PATHS[producer])
  const packageManifest = JSON.parse(await readFile(packagePath, 'utf8'))
  let installedPackageManifest: PackageManifest = {}
  try {
    const packageRoot = resolve(packagePath, '..')
    const installedPackagePath = resolve(packageRoot, 'node_modules', COVERAGE_PROVIDER.package, 'package.json')
    installedPackageManifest = JSON.parse(await readFile(installedPackagePath, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  return {
    coverageProvider: coverageProviderProvenanceFromPackage(installedPackageManifest),
    issues: coverageProviderInstallationIssues({
      producer,
      packageManifest,
      installedPackageManifest,
    }),
  }
}

const coverageProviderIdentity = (provider: CoverageProvider | undefined) => provider && {
  name: provider.name,
  package: provider.package,
  version: provider.version,
}

export const coverageProviderCompatibilityIssues = (coverageProviders: ProducerPair<CoverageProvider | undefined>) => {
  const node = coverageProviderIdentity(coverageProviders.node)
  const storybook = coverageProviderIdentity(coverageProviders.storybook)
  if (!node || !storybook || Object.values(node).some((value) => !value) || Object.values(storybook).some((value) => !value)) {
    return ['Node and Storybook coverage provider provenance is required before combining automation maps']
  }
  if (JSON.stringify(node) === JSON.stringify(storybook)) return []
  return [`Node and Storybook coverage providers differ: ${node.name} ${node.version} versus ${storybook.name} ${storybook.version}`]
}

const EMPTY_COVERAGE = Object.freeze(Object.fromEntries(
  COVERAGE_METRICS.map((metric) => [metric, Object.freeze({ covered: 0, total: 0 })])
) as FileCoverage)

export const normalizeCoveragePath = (path: string, repositoryRoot: string) =>
  relative(resolve(repositoryRoot), resolve(path)).split(sep).join('/')

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [
    key,
    stableValue((value as Record<string, unknown>)[key]),
  ]))
}

export const createEvidenceDigest = (inputs: Record<string, string>) => createHash('sha256')
  .update(JSON.stringify(stableValue(inputs)))
  .digest('hex')

export const validateProducerManifest = ({
  producer,
  manifest,
  revision,
  dirty,
  currentInputDigest,
  currentCoverageProvider,
}: {
  producer: string
  manifest: ProducerManifest
  revision: string
  dirty: boolean
  currentInputDigest: string
  currentCoverageProvider: CoverageProvider
}) => {
  const issues: string[] = []
  if (manifest.schemaVersion !== 2) issues.push(`${producer} coverage manifest has an unsupported schema`)
  if (manifest.producer !== producer) issues.push(`${producer} coverage manifest identifies ${manifest.producer ?? 'no producer'}`)
  if (!manifest.coverageProvider) {
    issues.push(`${producer} coverage manifest is missing coverage provider provenance`)
  } else if (JSON.stringify(coverageProviderIdentity(manifest.coverageProvider)) !== JSON.stringify(coverageProviderIdentity(currentCoverageProvider))) {
    issues.push(`${producer} coverage provider does not match the installed provider`)
  }
  if (manifest.revision !== revision || manifest.dirty !== dirty) {
    issues.push(`${producer} coverage source state does not match the current revision`)
  }
  if (manifest.inputDigest !== currentInputDigest) {
    issues.push(`${producer} coverage input digest does not match the current source and configuration`)
  }
  return issues
}

export const exactCoverage = (raw: FileCoverage): FileCoverage => ({
  statements: { covered: raw.statements.covered, total: raw.statements.total },
  branches: { covered: raw.branches.covered, total: raw.branches.total },
  functions: { covered: raw.functions.covered, total: raw.functions.total },
  lines: { covered: raw.lines.covered, total: raw.lines.total },
})

export const sumCoverage = (coverages: FileCoverage[]): FileCoverage =>
  Object.fromEntries(COVERAGE_METRICS.map((metric) => [
    metric,
    coverages.reduce((sum, coverage) => ({
      covered: sum.covered + coverage[metric].covered,
      total: sum.total + coverage[metric].total,
    }), { covered: 0, total: 0 }),
  ])) as FileCoverage

export const normalizeCoverageSummary = (
  summary: RawCoverageSummary,
  repositoryRoot: string
): Record<string, FileCoverage> => Object.fromEntries(
  Object.entries(summary)
    .filter(([path]) => path !== 'total')
    .map(([path, coverage]) => [normalizeCoveragePath(path, repositoryRoot), exactCoverage(coverage)] as [string, FileCoverage])
    .sort(([left], [right]) => left.localeCompare(right))
)

export const createCombinedOwnedRuntimeReach = ({
  repositoryRoot,
  summaries,
  ownedPathsByProducer,
}: {
  repositoryRoot: string
  summaries: ProducerPair<RawCoverageSummary>
  ownedPathsByProducer: ProducerPair<string[]>
}) => {
  const normalized = Object.fromEntries(Object.entries(summaries).map(([producer, producerSummary]) => [
    producer,
    normalizeCoverageSummary(producerSummary, repositoryRoot),
  ]))
  const selected = Object.entries(ownedPathsByProducer).flatMap(([producer, paths]) =>
    paths.map((path) => normalized[producer]?.[path] ?? EMPTY_COVERAGE)
  )
  return sumCoverage(selected as FileCoverage[])
}

const normalizeCoverageMap = (rawMap: Record<string, IstanbulFile>, repositoryRoot: string) => Object.fromEntries(
  Object.entries(rawMap).map(([reportedPath, file]) => {
    const path = normalizeCoveragePath(file.path ?? reportedPath, repositoryRoot)
    return [path, { ...file, path }]
  }).sort(([left], [right]) => String(left).localeCompare(String(right)))
)

/**
 */
export const createCoverageStabilitySnapshot = ({
  repositoryRoot,
  summary,
  map,
  paths,
}: {
  repositoryRoot: string
  summary: RawCoverageSummary
  map: Record<string, IstanbulFile>
  paths: string[]
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

const executableMap = (file: IstanbulFile) => stableValue({
  statementMap: file.statementMap,
  fnMap: file.fnMap,
  branchMap: file.branchMap,
})

const EXECUTABLE_MAP_SAMPLE_LIMIT = 3
const ALIGNMENT_GAP_COST = 2
const ALIGNMENT_DIFFERENT_LINE_COST = 3

const compareCounterIds = (left: string, right: string) => {
  const leftNumber = Number(left)
  const rightNumber = Number(right)
  if (Number.isInteger(leftNumber) && Number.isInteger(rightNumber)) return leftNumber - rightNumber
  return left.localeCompare(right)
}

const orderedMapEntries = (map: Record<string, CounterMapEntry>) => Object.entries(map ?? {})
  .sort(([left], [right]) => compareCounterIds(left, right))

const diagnosticLocation = (kind: CounterKind, entry: CounterMapEntry): SourceSpan | undefined =>
  kind === 'statements' ? entry : entry.loc

const exactEntryMatch = (left: unknown, right: unknown) =>
  JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right))

/**
 * Alignment is diagnostic only. Exact complete-map equality remains the compatibility rule.
 * Source-line spans let the report recognize a generated insertion without treating every
 * subsequent counter-id shift as a separate structural change.
 */
const alignMapEntries = (
  kind: CounterKind,
  left: Record<string, CounterMapEntry>,
  right: Record<string, CounterMapEntry>
) => {
  const leftEntries = orderedMapEntries(left)
  const rightEntries = orderedMapEntries(right)
  const rows = leftEntries.length + 1
  const columns = rightEntries.length + 1
  const costs = Array.from({ length: rows }, () => Array(columns).fill(0))
  const costAt = (rowIndex: number, columnIndex: number) => {
    const row = costs[rowIndex]
    const value = row?.[columnIndex]
    if (value === undefined) throw new TypeError('alignment cost matrix is missing a cell')
    return value
  }
  const setCost = (rowIndex: number, columnIndex: number, value: number) => {
    const row = costs[rowIndex]
    if (row === undefined) throw new TypeError('alignment cost matrix is missing a row')
    row[columnIndex] = value
  }
  const requiredPair = (entries: ReturnType<typeof orderedMapEntries>, index: number) => {
    const entry = entries[index]
    if (entry === undefined) throw new TypeError('alignment map entry is missing')
    return entry
  }
  for (let leftIndex = 0; leftIndex < rows; leftIndex += 1) {
    setCost(leftIndex, 0, leftIndex * ALIGNMENT_GAP_COST)
  }
  for (let rightIndex = 0; rightIndex < columns; rightIndex += 1) {
    setCost(0, rightIndex, rightIndex * ALIGNMENT_GAP_COST)
  }

  const replacementCost = (leftEntry: CounterMapEntry, rightEntry: CounterMapEntry) => {
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
      setCost(leftIndex, rightIndex, Math.min(
        costAt(leftIndex - 1, rightIndex - 1) + replacementCost(
          requiredPair(leftEntries, leftIndex - 1)[1],
          requiredPair(rightEntries, rightIndex - 1)[1]
        ),
        costAt(leftIndex - 1, rightIndex) + ALIGNMENT_GAP_COST,
        costAt(leftIndex, rightIndex - 1) + ALIGNMENT_GAP_COST
      ))
    }
  }

  const reversed: { left?: [string, CounterMapEntry], right?: [string, CounterMapEntry] }[] = []
  let leftIndex = leftEntries.length
  let rightIndex = rightEntries.length
  while (leftIndex > 0 || rightIndex > 0) {
    const replacement = leftIndex > 0 && rightIndex > 0
      ? costAt(leftIndex - 1, rightIndex - 1) + replacementCost(
        requiredPair(leftEntries, leftIndex - 1)[1],
        requiredPair(rightEntries, rightIndex - 1)[1]
      )
      : Number.POSITIVE_INFINITY
    if (replacement === costAt(leftIndex, rightIndex)) {
      reversed.push({ left: requiredPair(leftEntries, leftIndex - 1), right: requiredPair(rightEntries, rightIndex - 1) })
      leftIndex -= 1
      rightIndex -= 1
      continue
    }
    if (leftIndex > 0 && costAt(leftIndex - 1, rightIndex) + ALIGNMENT_GAP_COST === costAt(leftIndex, rightIndex)) {
      reversed.push({ left: requiredPair(leftEntries, leftIndex - 1) })
      leftIndex -= 1
      continue
    }
    const rightEntry = rightEntries[rightIndex - 1]
    reversed.push(rightEntry === undefined ? {} : { right: rightEntry })
    rightIndex -= 1
  }
  return reversed.reverse()
}

/**
 * Produce bounded diagnostics for two complete Istanbul executable maps.
 * This comparison explains incompatibility but never changes the exact-match verdict.
 *
 */
export const compareExecutableMaps = ({
  node,
  storybook,
  sampleLimit = EXECUTABLE_MAP_SAMPLE_LIMIT,
}: {
  node: IstanbulFile
  storybook: IstanbulFile
  sampleLimit?: number
}): ExecutableMapsComparison => {
  const mapDefinitions: readonly (readonly [CounterKind, 'statementMap' | 'fnMap' | 'branchMap'])[] = [
    ['statements', 'statementMap'],
    ['functions', 'fnMap'],
    ['branches', 'branchMap'],
  ]
  const maps = Object.fromEntries(mapDefinitions.map(([kind, property]) => {
    const nodeMap = node[property] ?? {}
    const storybookMap = storybook[property] ?? {}
    const differences: CounterDifference[] = []
    for (const { left, right } of alignMapEntries(kind, nodeMap, storybookMap)) {
      if (left && right && exactEntryMatch(left[1], right[1])) continue
      if (left && right) {
        differences.push({
          kind: 'different',
          counters: { node: left[0], storybook: right[0] },
          locations: {
            node: diagnosticLocation(kind, left[1]),
            storybook: diagnosticLocation(kind, right[1]),
          },
        })
        continue
      }
      const producer = left ? 'node' : 'storybook'
      const [counter, entry] = (left ?? right) as [string, CounterMapEntry]
      differences.push({
        kind: 'only',
        producer,
        counter,
        location: diagnosticLocation(kind, entry),
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
    maps: maps as ExecutableMapsComparison['maps'],
  }
}

const mergeFileCounters = (left: IstanbulFile, right: IstanbulFile): IstanbulFile => {
  const maxHit = (leftHit: number | undefined, rightHit: number | undefined) =>
    Math.max(leftHit ?? Number.NaN, rightHit ?? Number.NaN)
  return {
    ...left,
    s: Object.fromEntries(Object.keys(left.s ?? {}).map((key) => [
      key,
      maxHit((left.s ?? {})[key], (right.s ?? {})[key]),
    ])),
    f: Object.fromEntries(Object.keys(left.f ?? {}).map((key) => [
      key,
      maxHit((left.f ?? {})[key], (right.f ?? {})[key]),
    ])),
    b: Object.fromEntries(Object.keys(left.b ?? {}).map((key) => {
      const leftHits = (left.b ?? {})[key]
      const rightHits = (right.b ?? {})[key]
      if (leftHits === undefined) throw new TypeError(`Missing left branch counters for ${key}`)
      if (rightHits === undefined) throw new TypeError(`Missing right branch counters for ${key}`)
      return [key, leftHits.map((hit, index) => maxHit(hit, rightHits[index]))]
    })),
  }
}

const coverageFromMap = (file: IstanbulFile): FileCoverage => {
  const statementHits = Object.values(file.s ?? {})
  const functionHits = Object.values(file.f ?? {})
  const branchHits = Object.values(file.b ?? {}).flat()
  const lineHits: Map<number, number> = new Map()
  for (const [key, hit] of Object.entries(file.s ?? {})) {
    const line = file.statementMap?.[key]?.start?.line
    lineHits.set(line!, Math.max(lineHits.get(line!) ?? 0, hit))
  }
  const tuple = (hits: number[]) => ({ covered: hits.filter((hit) => hit > 0).length, total: hits.length })
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
 */
export const createCombinedAutomationReach = ({
  repositoryRoot,
  maps,
  sourceDigests,
  coverageProviders,
  expectedOverlapFiles,
}: {
  repositoryRoot: string
  maps: ProducerPair<Record<string, IstanbulFile>>
  sourceDigests: ProducerPair<Record<string, string>>
  coverageProviders: ProducerPair<CoverageProvider | undefined>
  expectedOverlapFiles?: number
}): CombinedAutomationReach => {
  const providerIssues = coverageProviderCompatibilityIssues(coverageProviders)
  if (providerIssues.length > 0) {
    return { status: 'withheld', incompatibleFiles: [], providerIssues, admissionIssues: [], coverage: undefined }
  }
  const normalized: ProducerPair<Record<string, IstanbulFile>> = {
    node: normalizeCoverageMap(maps.node, repositoryRoot),
    storybook: normalizeCoverageMap(maps.storybook, repositoryRoot),
  }
  const producers: CoverageProducer[] = ['node', 'storybook']
  const fileFor = (producer: CoverageProducer, path: string) => normalized[producer][path]
  const paths = [...new Set(producers.flatMap((producer) => Object.keys(normalized[producer])))].sort()
  const overlapFiles = paths.filter((path) => producers.every((producer) => fileFor(producer, path))).length
  const admissionIssues = expectedOverlapFiles !== undefined && overlapFiles !== expectedOverlapFiles
    ? [`Combined automation overlap changed: expected ${expectedOverlapFiles} files, found ${overlapFiles}`]
    : []
  const incompatibleFiles: IncompatibleFile[] = []
  const combined: FileCoverage[] = []

  for (const path of paths) {
    const present = producers.filter((producer) => fileFor(producer, path))
    if (present.length === 1) {
      const producer = present[0]
      if (producer === undefined) continue
      const onlyFile = fileFor(producer, path)
      if (onlyFile === undefined) continue
      combined.push(coverageFromMap(onlyFile))
      continue
    }
    const [first, ...others] = present
    if (first === undefined) continue
    const firstSourceDigest = sourceDigests[first][path]
    if (!firstSourceDigest || others.some((producer) => !sourceDigests[producer][path])) {
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
    const nodeFile = fileFor('node', path)
    const storybookFile = fileFor('storybook', path)
    if (nodeFile === undefined || storybookFile === undefined) continue
    const executableMaps = compareExecutableMaps({
      node: nodeFile,
      storybook: storybookFile,
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
    const firstFile = fileFor(first, path)
    if (firstFile === undefined) continue
    const merged = others.reduce((current, producer) => {
      const otherFile = fileFor(producer, path)
      if (otherFile === undefined) throw new TypeError(`Missing coverage map for ${path}`)
      return mergeFileCounters(current, otherFile)
    }, firstFile)
    combined.push(coverageFromMap(merged))
  }

  if (incompatibleFiles.length > 0 || admissionIssues.length > 0) {
    return { status: 'withheld', incompatibleFiles, providerIssues: [], admissionIssues, coverage: undefined }
  }
  return { status: 'available', incompatibleFiles: [], providerIssues: [], admissionIssues: [], coverage: sumCoverage(combined) }
}

export const stabilityAdmissionIssues = ({
  dirty,
  revisionChanged = false,
  runDigests,
  expectedRuns,
}: {
  dirty: boolean
  revisionChanged?: boolean
  runDigests: string[]
  expectedRuns: number
}) => {
  const issues: string[] = []
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
