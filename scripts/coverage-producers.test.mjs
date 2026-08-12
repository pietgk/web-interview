import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  createCombinedAutomationReach,
  createCombinedOwnedRuntimeReach,
  createCoverageStabilitySnapshot,
  createEvidenceDigest,
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
  assert.deepEqual(result.incompatibleFiles, [
    { path: digestPath, reason: 'source digest differs between producers' },
    { path: mapPath, reason: 'executable maps differ between producers' },
  ])
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
