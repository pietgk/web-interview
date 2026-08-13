import assert from 'node:assert/strict'
import { test } from 'vitest'
import { classifySourcePath, createSourceEvidence } from './source-evidence.ts'
import {
  SOURCE_EVIDENCE_ENTRIES,
  TREATMENTS,
  validateSourceEvidenceRegistry,
} from './source-evidence-registry.ts'

/** @param {number} covered @param {number} total */
const coverage = (covered, total) => ({ covered, total })
const fileCoverage = (covered = 1, total = 1) => ({
  statements: coverage(covered, total),
  branches: coverage(covered, total),
  functions: coverage(covered, total),
  lines: coverage(covered, total),
})
const registryEntriesFor = (paths: string[]) => SOURCE_EVIDENCE_ENTRIES.filter(({ path }) => paths.includes(path))

test('classifies every production source seam explicitly', () => {
  const examples = {
    'shared/src/datom.js': 'node-runtime',
    'shared/src/types.js': 'type-only',
    'backend/src/app.js': 'node-runtime',
    'backend/src/index.js': 'playwright-bootstrap',
    'frontend/src/todos/todoModel.js': 'node-runtime',
    'frontend/src/todos/trustedClock.js': 'node-runtime',
    'frontend/src/testing/fakeDatomServer.js': 'node-runtime',
    'frontend/src/App.jsx': 'rendered-ui',
    'frontend/src/theme.js': 'rendered-ui',
    'frontend/src/todos/components/TodoItem.jsx': 'rendered-ui',
    'frontend/src/todos/useSettledText.js': 'storybook-controller',
    'frontend/src/todos/components/focusLeft.js': 'rendered-ui',
    'frontend/src/index.jsx': 'playwright-bootstrap',
    'frontend/src/testing/storyHarness.jsx': 'test-support-storybook',
    'frontend/src/testing/storyDocs.js': 'test-support-storybook',
    'frontend/src/themeTokens.d.ts': 'type-only',
  }

  for (const [path, expected] of Object.entries(examples)) {
    assert.equal(classifySourcePath(path)?.treatment, expected, path)
  }
  // Discovery is general, but semantic treatment is always an explicit review.
  assert.equal(classifySourcePath('shared/src/anything.d.ts'), undefined)
  assert.equal(classifySourcePath('frontend/src/unowned.js'), undefined)
  assert.equal(classifySourcePath('frontend/src/App.stories.jsx'), undefined)
  assert.equal(classifySourcePath('backend/src/app.test.js'), undefined)
})

test('the reviewed registry assigns producer and verdict semantics once per treatment', () => {
  assert.deepEqual(TREATMENTS['node-runtime'], {
    producer: 'node',
    verdict: 'exact-coverage',
  })
  assert.deepEqual(TREATMENTS['storybook-controller'], {
    producer: 'storybook',
    verdict: 'exact-coverage',
  })
  assert.equal(TREATMENTS['rendered-ui'].verdict, 'story-play-axe')

  const paths = SOURCE_EVIDENCE_ENTRIES.map(({ path }) => path)
  assert.equal(new Set(paths).size, paths.length)
})

test('registry validation fails closed for missing, deleted, duplicate, and invalid entries', () => {
  const entries: any[] = [
    { path: 'shared/src/a.js', treatment: 'node-runtime', rationale: 'pure logic' },
    { path: 'shared/src/a.js', treatment: 'node-runtime', rationale: 'duplicate' },
    { path: 'shared/src/deleted.js', treatment: 'node-runtime', rationale: 'gone' },
    { path: 'frontend/src/App.jsx', treatment: 'rendered-ui', rationale: '' },
    { path: 'frontend/src/themeTokens.d.ts', treatment: 'not-real', rationale: 'wrong' },
  ]
  const issues = validateSourceEvidenceRegistry({
    entries,
    sourcePaths: [
      'shared/src/a.js',
      'frontend/src/App.jsx',
      'frontend/src/new.js',
      'frontend/src/themeTokens.d.ts',
    ],
  })

  assert.deepEqual(issues, [
    'shared/src/a.js: duplicate evidence registry entry',
    'frontend/src/App.jsx: evidence rationale is required',
    'frontend/src/themeTokens.d.ts: unknown evidence treatment not-real',
    'frontend/src/new.js: no evidence registry entry',
    'shared/src/deleted.js: evidence registry entry has no source file',
  ])
})

test('accounts for source ownership and reports UI execution separately from the logic baseline', () => {
  const appPath = 'frontend/src/App.jsx'
  const storyPath = 'frontend/src/App.stories.jsx'
  const logicPath = 'shared/src/datom.js'
  const evidence = createSourceEvidence({
    sourcePaths: [appPath, 'frontend/src/index.jsx', logicPath, 'shared/src/types.js'],
    registryEntries: registryEntriesFor([appPath, 'frontend/src/index.jsx', logicPath, 'shared/src/types.js']),
    baselinePathsByProducer: { node: [logicPath], storybook: [] },
    summary: {
      total: fileCoverage(),
      [`/repo/${appPath}`]: fileCoverage(4, 5),
      [`/repo/${logicPath}`]: fileCoverage(),
    },
    repositoryRoot: '/repo',
    storySources: {
      [storyPath]: `
        export default { component: App }
        export const Empty = { play: async () => {} }
        export const Populated = { play: async () => {} }
      `,
    },
    storyResults: {
      testResults: [{
        name: `/repo/${storyPath}`,
        assertionResults: [{ status: 'passed' }, { status: 'passed' }],
      }],
    },
  })

  assert.equal(evidence.verdict, 'pass')
  assert.deepEqual(evidence.categoryCounts, {
    'node-runtime': 1,
    'storybook-controller': 0,
    'rendered-ui': 1,
    'playwright-bootstrap': 1,
    'test-support-node': 0,
    'test-support-storybook': 0,
    'type-only': 1,
  })
  assert.deepEqual(evidence.ui, [{
    path: appPath,
    evidence: storyPath,
    declaredStories: 2,
    declaredPlays: 2,
    executedStories: 2,
    coverage: fileCoverage(4, 5),
  }])
  assert.deepEqual(evidence.uiTotals, fileCoverage(4, 5))
})

test('fails closed on unowned source, baseline drift, or missing Storybook execution', () => {
  const evidence = createSourceEvidence({
    sourcePaths: ['frontend/src/unowned.js', 'frontend/src/App.jsx'],
    registryEntries: registryEntriesFor(['frontend/src/App.jsx']),
    baselinePathsByProducer: { node: ['shared/src/deleted.js'], storybook: [] },
    summary: {
      total: fileCoverage(),
      '/repo/frontend/src/App.jsx': fileCoverage(),
    },
    repositoryRoot: '/repo',
    storySources: {
      'frontend/src/App.stories.jsx': 'export const Empty = { play: async () => {} }',
    },
    storyResults: { testResults: [] },
  })

  assert.equal(evidence.verdict, 'fail')
  assert.deepEqual(evidence.issues, [
    'frontend/src/unowned.js: no evidence registry entry',
    'shared/src/deleted.js: node baseline entry is not owned by node',
    'frontend/src/App.stories.jsx: declared 1 stories but executed 0',
  ])
})

test('rejects exact baseline paths under the wrong producer or non-coverage treatment', () => {
  const evidence = createSourceEvidence({
    sourcePaths: ['shared/src/datom.js', 'frontend/src/App.jsx'],
    registryEntries: registryEntriesFor(['shared/src/datom.js', 'frontend/src/App.jsx']),
    baselinePathsByProducer: {
      node: [],
      storybook: ['shared/src/datom.js', 'frontend/src/App.jsx'],
    },
    summary: {
      '/repo/frontend/src/App.jsx': fileCoverage(),
    },
    repositoryRoot: '/repo',
    storySources: {},
    storyResults: { testResults: [] },
  })

  assert.ok(evidence.issues.includes('shared/src/datom.js: node-owned source is absent from the node exact baseline'))
  assert.ok(evidence.issues.includes('frontend/src/App.jsx: storybook baseline entry does not allow exact coverage'))
})

test('theme treatment requires its declared Storybook story and play execution', () => {
  const themePath = 'frontend/src/theme.js'
  const storyPath = 'frontend/src/theme.stories.jsx'
  const evidence = createSourceEvidence({
    sourcePaths: [themePath],
    registryEntries: registryEntriesFor([themePath]),
    baselinePathsByProducer: { node: [], storybook: [] },
    summary: { [`/repo/${themePath}`]: fileCoverage() },
    repositoryRoot: '/repo',
    storySources: {
      [storyPath]: 'export const SystemPrefsWired = { play: async () => {} }',
    },
    storyResults: {
      testResults: [{ name: `/repo/${storyPath}`, assertionResults: [{ status: 'passed' }] }],
    },
  })

  assert.equal(evidence.verdict, 'pass')
  assert.equal(evidence.ui[0].evidence, storyPath)
  assert.equal(evidence.ui[0].declaredPlays, 1)
  assert.equal(evidence.ui[0].executedStories, 1)
})
