import assert from 'node:assert/strict'
import { test } from 'vitest'
import { classifySourcePath, createSourceEvidence } from './source-evidence.mjs'

/** @param {number} covered @param {number} total */
const coverage = (covered, total) => ({ covered, total })
const fileCoverage = (covered = 1, total = 1) => ({
  statements: coverage(covered, total),
  branches: coverage(covered, total),
  functions: coverage(covered, total),
  lines: coverage(covered, total),
})

test('classifies every production source seam explicitly', () => {
  const examples = {
    'shared/src/datom.js': 'logic-baseline',
    'shared/src/types.js': 'type-only',
    'backend/src/app.js': 'logic-baseline',
    'backend/src/index.js': 'e2e-bootstrap',
    'frontend/src/todos/todoModel.js': 'logic-baseline',
    'frontend/src/testing/fakeDatomServer.js': 'logic-baseline',
    'frontend/src/App.jsx': 'storybook-ui',
    'frontend/src/theme.js': 'storybook-ui',
    'frontend/src/todos/components/TodoItem.jsx': 'storybook-ui',
    'frontend/src/index.jsx': 'e2e-bootstrap',
    'frontend/src/testing/storyHarness.jsx': 'test-support',
    'frontend/src/testing/storyDocs.js': 'test-support',
    'frontend/src/themeTokens.d.ts': 'type-only',
  }

  for (const [path, expected] of Object.entries(examples)) {
    assert.equal(classifySourcePath(path)?.category, expected, path)
  }
  // The rule is the suffix, not the path: a declaration file anywhere emits no
  // runtime, and a `.js` beside it is still an unowned seam.
  assert.equal(classifySourcePath('shared/src/anything.d.ts')?.category, 'type-only')
  assert.equal(classifySourcePath('frontend/src/unowned.js'), undefined)
  assert.equal(classifySourcePath('frontend/src/App.stories.jsx'), undefined)
  assert.equal(classifySourcePath('backend/src/app.test.js'), undefined)
})

test('accounts for source ownership and reports UI execution separately from the logic baseline', () => {
  const appPath = 'frontend/src/App.jsx'
  const storyPath = 'frontend/src/App.stories.jsx'
  const logicPath = 'shared/src/datom.js'
  const evidence = createSourceEvidence({
    sourcePaths: [appPath, 'frontend/src/index.jsx', logicPath, 'shared/src/types.js'],
    baselinePaths: [logicPath],
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
    'logic-baseline': 1,
    'storybook-ui': 1,
    'e2e-bootstrap': 1,
    'test-support': 0,
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
    baselinePaths: ['shared/src/deleted.js'],
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
    'frontend/src/unowned.js: no evidence category',
    'shared/src/deleted.js: baseline entry is not classified as logic',
    'frontend/src/App.stories.jsx: declared 1 stories but executed 0',
  ])
})
