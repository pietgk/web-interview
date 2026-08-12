import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  compareExecutableMaps,
  createCombinedAutomationReach,
  createCombinedOwnedRuntimeReach,
  createCoverageStabilitySnapshot,
  createEvidenceDigest,
  stabilityAdmissionIssues,
  validateProducerManifest,
} from './coverage-producers.mjs'

/** @param {number} covered @param {number} total */
const tuple = (covered, total) => ({ covered, total })
/** @param {number} covered @param {number} total */
const fileCoverage = (covered, total) => ({
  statements: tuple(covered, total),
  branches: tuple(covered, total),
  functions: tuple(covered, total),
  lines: tuple(covered, total),
})
/** @param {Record<string, ReturnType<typeof fileCoverage>>} files */
const summary = (files) => ({
  total: fileCoverage(0, 0),
  ...Object.fromEntries(Object.entries(files).map(([path, value]) => [`/repo/${path}`, value])),
})
/** @param {string} path @param {{statementHit?: number, branchHits?: number[], functionHit?: number, line?: number}} [options] */
const mapFor = (path, { statementHit = 0, branchHits = [0, 0], functionHit = 0, line = 1 } = {}) => ({
  path: `/repo/${path}`,
  statementMap: { 0: { start: { line, column: 0 }, end: { line, column: 1 } } },
  fnMap: { 0: { name: 'run', decl: { start: { line, column: 0 }, end: { line, column: 1 } }, loc: { start: { line, column: 0 }, end: { line, column: 1 } }, line } },
  branchMap: { 0: { type: 'if', line, loc: { start: { line, column: 0 }, end: { line, column: 1 } }, locations: [
    { start: { line, column: 0 }, end: { line, column: 1 } },
    { start: { line, column: 0 }, end: { line, column: 1 } },
  ] } },
  s: { 0: statementHit },
  f: { 0: functionHit },
  b: { 0: branchHits },
})

/** @param {string} path @param {Array<{start: {line: number, column: number}, end: {line: number, column: number | null}}>} statements */
const mapWithStatements = (path, statements) => ({
  ...mapFor(path),
  statementMap: Object.fromEntries(statements.map((location, index) => [index, location])),
  s: Object.fromEntries(statements.map((_, index) => [index, 0])),
})

/** @param {number} line @param {number} column */
const location = (line, column) => ({
  start: { line, column },
  end: { line, column: null },
})

test('executable-map diagnostics distinguish one changed source location from matching maps', () => {
  const node = mapWithStatements('frontend/src/a.js', [location(4, 14)])
  const storybook = mapWithStatements('frontend/src/a.js', [location(4, 15)])

  const result = compareExecutableMaps({ node, storybook })

  assert.equal(result.exactMatch, false)
  assert.deepEqual(result.maps.statements, {
    entryCounts: { node: 1, storybook: 1 },
    differingEntries: 1,
    onlyIn: { node: 0, storybook: 0 },
    samples: [{
      kind: 'different',
      counters: { node: '0', storybook: '0' },
      locations: { node: location(4, 14), storybook: location(4, 15) },
    }],
    omittedSamples: 0,
  })
  assert.equal(result.maps.functions.differingEntries, 0)
  assert.equal(result.maps.branches.differingEntries, 0)
})

test('executable-map diagnostics align an extra generated statement without cascading counter mismatches', () => {
  const node = mapWithStatements('frontend/src/a.js', [location(5, 2), location(6, 2)])
  const storybook = mapWithStatements('frontend/src/a.js', [
    location(1, 31),
    location(5, 2),
    location(6, 2),
  ])

  const result = compareExecutableMaps({ node, storybook })

  assert.deepEqual(result.maps.statements, {
    entryCounts: { node: 2, storybook: 3 },
    differingEntries: 0,
    onlyIn: { node: 0, storybook: 1 },
    samples: [{
      kind: 'only',
      producer: 'storybook',
      counter: '0',
      location: location(1, 31),
    }],
    omittedSamples: 0,
  })
})

test('executable-map diagnostic samples are deterministic and bounded', () => {
  const node = mapWithStatements('frontend/src/a.js', [
    location(2, 0),
    location(3, 0),
    location(4, 0),
    location(5, 0),
  ])
  const storybook = mapWithStatements('frontend/src/a.js', [
    location(2, 1),
    location(3, 1),
    location(4, 1),
    location(5, 1),
  ])

  const result = compareExecutableMaps({ node, storybook, sampleLimit: 2 })

  assert.deepEqual(result.maps.statements.samples.map(({ counters }) => counters), [
    { node: '0', storybook: '0' },
    { node: '1', storybook: '1' },
  ])
  assert.equal(result.maps.statements.omittedSamples, 2)
})

test('producer manifests expose source or config digest drift and prevent comparison', () => {
  const captured = {
    schemaVersion: 1,
    producer: 'node',
    revision: 'abc',
    dirty: false,
    inputDigest: createEvidenceDigest({
      'shared/src/a.js': 'export const a = 1',
      'vitest.config.mjs': 'export default {}',
    }),
  }
  const currentInputDigest = createEvidenceDigest({
    'shared/src/a.js': 'export const a = 2',
    'vitest.config.mjs': 'export default {}',
  })

  assert.deepEqual(validateProducerManifest({
    producer: 'node',
    manifest: captured,
    revision: 'abc',
    dirty: false,
    currentInputDigest,
  }), ['node coverage input digest does not match the current source and configuration'])
})

test('combined owned runtime reach selects only the required producer for each file', () => {
  const reach = createCombinedOwnedRuntimeReach({
    repositoryRoot: '/repo',
    summaries: {
      node: summary({
        'shared/src/a.js': fileCoverage(1, 2),
        'frontend/src/controller.js': fileCoverage(10, 10),
      }),
      storybook: summary({
        'shared/src/a.js': fileCoverage(2, 2),
        'frontend/src/controller.js': fileCoverage(3, 4),
      }),
    },
    ownedPathsByProducer: {
      node: ['shared/src/a.js'],
      storybook: ['frontend/src/controller.js'],
    },
  })

  assert.deepEqual(reach.statements, tuple(4, 6))
})

test('compatible producer maps union counters without double-counting executable items', () => {
  const path = 'frontend/src/a.js'
  const result = createCombinedAutomationReach({
    repositoryRoot: '/repo',
    maps: {
      node: { [`/repo/${path}`]: mapFor(path, { statementHit: 1, branchHits: [1, 0] }) },
      storybook: { [`/repo/${path}`]: mapFor(path, { functionHit: 1, branchHits: [0, 1] }) },
    },
    sourceDigests: {
      node: { [path]: 'same' },
      storybook: { [path]: 'same' },
    },
  })

  assert.equal(result.status, 'available')
  assert.ok(result.coverage)
  assert.deepEqual(result.coverage.statements, tuple(1, 1))
  assert.deepEqual(result.coverage.branches, tuple(2, 2))
  assert.deepEqual(result.coverage.functions, tuple(1, 1))
})

test('different source digests or executable maps withhold only the automation union', () => {
  const digestPath = 'frontend/src/digest.js'
  const mapPath = 'frontend/src/map.js'
  const result = createCombinedAutomationReach({
    repositoryRoot: '/repo',
    maps: {
      node: {
        [`/repo/${digestPath}`]: mapFor(digestPath),
        [`/repo/${mapPath}`]: mapFor(mapPath),
      },
      storybook: {
        [`/repo/${digestPath}`]: mapFor(digestPath),
        [`/repo/${mapPath}`]: mapFor(mapPath, { line: 2 }),
      },
    },
    sourceDigests: {
      node: { [digestPath]: 'old', [mapPath]: 'same' },
      storybook: { [digestPath]: 'new', [mapPath]: 'same' },
    },
  })

  assert.equal(result.status, 'withheld')
  assert.deepEqual(result.incompatibleFiles[0], {
    path: digestPath,
    reason: 'source digest differs between producers',
    sourceDigest: { status: 'differs' },
  })
  assert.equal(result.incompatibleFiles[1].path, mapPath)
  assert.equal(result.incompatibleFiles[1].reason, 'executable maps differ between producers')
  assert.deepEqual(result.incompatibleFiles[1].sourceDigest, { status: 'matches' })
  assert.deepEqual(result.incompatibleFiles[1].executableMaps.maps.statements, {
    entryCounts: { node: 1, storybook: 1 },
    differingEntries: 1,
    onlyIn: { node: 0, storybook: 0 },
    samples: [{
      kind: 'different',
      counters: { node: '0', storybook: '0' },
      locations: {
        node: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } },
        storybook: { start: { line: 2, column: 0 }, end: { line: 2, column: 1 } },
      },
    }],
    omittedSamples: 0,
  })
  assert.equal(result.incompatibleFiles[1].executableMaps.maps.functions.differingEntries, 1)
  assert.equal(result.incompatibleFiles[1].executableMaps.maps.branches.differingEntries, 1)
})

test('a missing overlap source digest cannot be treated as compatible', () => {
  const path = 'frontend/src/missing-digest.js'
  const result = createCombinedAutomationReach({
    repositoryRoot: '/repo',
    maps: {
      node: { [`/repo/${path}`]: mapFor(path) },
      storybook: { [`/repo/${path}`]: mapFor(path) },
    },
    sourceDigests: { node: {}, storybook: {} },
  })

  assert.deepEqual(result.incompatibleFiles, [{
    path,
    reason: 'source digest is missing from producer evidence',
    sourceDigest: { status: 'missing' },
  }])
})

test('stability admission requires one clean revision and the complete run count', () => {
  assert.deepEqual(stabilityAdmissionIssues({
    dirty: true,
    revisionChanged: true,
    runDigests: [],
    expectedRuns: 10,
  }), [
    'Storybook stability admission requires a clean worktree',
    'Storybook stability admission requires one unchanged revision',
    'Storybook stability admission collected 0/10 runs',
  ])
  assert.deepEqual(stabilityAdmissionIssues({
    dirty: false,
    runDigests: Array(10).fill('same'),
    expectedRuns: 10,
  }), [])
})

test('controller stability snapshot includes complete maps and exact tuples', () => {
  const path = 'frontend/src/controller.js'
  const first = createCoverageStabilitySnapshot({
    repositoryRoot: '/repo',
    summary: summary({ [path]: fileCoverage(1, 1) }),
    map: { [`/repo/${path}`]: mapFor(path, { statementHit: 1 }) },
    paths: [path],
  })
  const changed = createCoverageStabilitySnapshot({
    repositoryRoot: '/repo',
    summary: summary({ [path]: fileCoverage(1, 1) }),
    map: { [`/repo/${path}`]: mapFor(path, { statementHit: 2 }) },
    paths: [path],
  })

  assert.notEqual(first.digest, changed.digest)
  assert.deepEqual(first.paths, [path])
})
