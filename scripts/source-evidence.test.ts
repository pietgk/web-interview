import assert from 'node:assert/strict'
import { test } from 'vitest'
import { classifySourcePath, createSourceEvidence } from './source-evidence.ts'
import {
  SOURCE_EVIDENCE_ENTRIES,
  TREATMENTS,
  validateSourceEvidenceRegistry,
} from './source-evidence-registry.ts'

const coverage = (covered: number, total: number) => ({ covered, total })
const fileCoverage = (covered = 1, total = 1) => ({
  statements: coverage(covered, total),
  branches: coverage(covered, total),
  functions: coverage(covered, total),
  lines: coverage(covered, total),
})
const registryEntriesFor = (paths: string[]) => SOURCE_EVIDENCE_ENTRIES.filter(({ path }) => paths.includes(path))

test('classifies every production source seam explicitly', () => {
  const examples = {
    'shared/src/datom.ts': 'node-runtime',
    'shared/src/types.ts': 'type-only',
    'backend/src/app.ts': 'node-runtime',
    'backend/src/index.ts': 'playwright-bootstrap',
    'frontend/src/todos/todoModel.ts': 'node-runtime',
    'frontend/src/todos/trustedClock.ts': 'node-runtime',
    'frontend/src/testing/fakeDatomServer.ts': 'node-runtime',
    'frontend/src/App.tsx': 'rendered-ui',
    'frontend/src/theme.ts': 'rendered-ui',
    'frontend/src/todos/components/TodoItem.tsx': 'rendered-ui',
    'frontend/src/todos/useSettledText.ts': 'storybook-controller',
    'frontend/src/todos/components/focusLeft.ts': 'rendered-ui',
    'frontend/src/index.tsx': 'playwright-bootstrap',
    'frontend/src/testing/storyHarness.tsx': 'test-support-storybook',
    'frontend/src/testing/storyDocs.ts': 'test-support-storybook',
    'frontend/src/themeTokens.d.ts': 'type-only',
  }

  for (const [path, expected] of Object.entries(examples)) {
    assert.equal(classifySourcePath(path)?.treatment, expected, path)
  }
  // Discovery is general, but semantic treatment is always an explicit review.
  assert.equal(classifySourcePath('shared/src/anything.d.ts'), undefined)
  assert.equal(classifySourcePath('frontend/src/unowned.js'), undefined)
  assert.equal(classifySourcePath('frontend/src/App.stories.tsx'), undefined)
  assert.equal(classifySourcePath('backend/src/app.test.ts'), undefined)
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
  const entries = [
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
  const appPath = 'frontend/src/App.tsx'
  const storyPath = 'frontend/src/App.stories.tsx'
  const logicPath = 'shared/src/datom.ts'
  const evidence = createSourceEvidence({
    sourcePaths: [appPath, 'frontend/src/index.tsx', logicPath, 'shared/src/types.ts'],
    registryEntries: registryEntriesFor([appPath, 'frontend/src/index.tsx', logicPath, 'shared/src/types.ts']),
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
    sourcePaths: ['frontend/src/unowned.js', 'frontend/src/App.tsx'],
    registryEntries: registryEntriesFor(['frontend/src/App.tsx']),
    baselinePathsByProducer: { node: ['shared/src/deleted.js'], storybook: [] },
    summary: {
      total: fileCoverage(),
      '/repo/frontend/src/App.tsx': fileCoverage(),
    },
    repositoryRoot: '/repo',
    storySources: {
      'frontend/src/App.stories.tsx': 'export const Empty = { play: async () => {} }',
    },
    storyResults: { testResults: [] },
  })

  assert.equal(evidence.verdict, 'fail')
  assert.deepEqual(evidence.issues, [
    'frontend/src/unowned.js: no evidence registry entry',
    'shared/src/deleted.js: node baseline entry is not owned by node',
    'frontend/src/App.stories.tsx: declared 1 stories but executed 0',
  ])
})

test('rejects exact baseline paths under the wrong producer or non-coverage treatment', () => {
  const evidence = createSourceEvidence({
    sourcePaths: ['shared/src/datom.ts', 'frontend/src/App.tsx'],
    registryEntries: registryEntriesFor(['shared/src/datom.ts', 'frontend/src/App.tsx']),
    baselinePathsByProducer: {
      node: [],
      storybook: ['shared/src/datom.ts', 'frontend/src/App.tsx'],
    },
    summary: {
      '/repo/frontend/src/App.tsx': fileCoverage(),
    },
    repositoryRoot: '/repo',
    storySources: {},
    storyResults: { testResults: [] },
  })

  assert.ok(evidence.issues.includes('shared/src/datom.ts: node-owned source is absent from the node exact baseline'))
  assert.ok(evidence.issues.includes('frontend/src/App.tsx: storybook baseline entry does not allow exact coverage'))
})

test('theme treatment requires its declared Storybook story and play execution', () => {
  const themePath = 'frontend/src/theme.ts'
  const storyPath = 'frontend/src/theme.stories.tsx'
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
  const ui = evidence.ui[0]
  assert.ok(ui)
  assert.equal(ui.evidence, storyPath)
  assert.equal(ui.declaredPlays, 1)
  assert.equal(ui.executedStories, 1)
})
