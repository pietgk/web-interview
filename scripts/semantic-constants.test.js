import assert from 'node:assert/strict'
import { Linter } from 'eslint'
import { test } from 'vitest'
import semanticConstants from './eslint-plugin-semantic-constants.js'
import {
  canonicalContractOptions,
  namedLiteralOptions,
} from './semantic-constants-config.js'

const linter = new Linter()

/**
 * @param {string} code
 * @param {{filename?: string, named?: Record<string, unknown>, jsx?: boolean}} [settings]
 */
const lint = (code, { filename = 'example.js', named = {}, jsx = false } = {}) =>
  linter.verify(code, [
    {
      files: ['**/*.{js,jsx}'],
      plugins: { 'semantic-constants': semanticConstants },
      languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        parserOptions: { ecmaFeatures: { jsx } },
      },
      rules: {
        'semantic-constants/require-named-literal': [
          'error',
          namedLiteralOptions(named),
        ],
        'semantic-constants/require-canonical-contract': [
          'error',
          canonicalContractOptions,
        ],
      },
    },
  ], { filename })

/** @param {string} code @param {Parameters<typeof lint>[1]} [options] */
const ruleMessages = (code, options) => lint(code, options).map(({ ruleId, messageId }) => ({
  ruleId,
  messageId,
}))

test('requires executable ISO dates to have meaningful const names', () => {
  assert.deepEqual(ruleMessages(`expect(today).toBe('2026-08-01')`), [
    { ruleId: 'semantic-constants/require-named-literal', messageId: 'date' },
  ])
  assert.deepEqual(ruleMessages(`const date = '2026-08-01'`), [
    { ruleId: 'semantic-constants/require-named-literal', messageId: 'name' },
  ])
  assert.deepEqual(ruleMessages(`const expectedDayAfterHeartbeat = '2026-08-01'`), [])
})

test('ignores dates embedded in prose but checks tables and nested fixtures', () => {
  assert.deepEqual(ruleMessages(`const explanation = 'The scenario starts on 2026-08-01.'`), [])
  assert.deepEqual(ruleMessages(`const cases = [['2026-08-01', { dueDate: '2026-08-02' }]]`), [
    { ruleId: 'semantic-constants/require-named-literal', messageId: 'date' },
    { ruleId: 'semantic-constants/require-named-literal', messageId: 'date' },
  ])
})

test('checks exact static template-literal dates too', () => {
  assert.deepEqual(ruleMessages('expect(today).toBe(`2026-08-01`)'), [
    { ruleId: 'semantic-constants/require-named-literal', messageId: 'date' },
  ])
  assert.deepEqual(ruleMessages('const expectedDay = `2026-08-01`'), [])
})

test('lets a descriptive const own a complete numeric expression', () => {
  assert.deepEqual(ruleMessages(`const NEXT_DAY_ADVANCE_MS = 24 * 60 * 60 * 1_000`), [])
  assert.deepEqual(ruleMessages(`const MAX_ULID_TIME = 2 ** 48 - 1`), [])
  assert.deepEqual(ruleMessages(`server.advance(24 * 60 * 60 * 1_000)`), [
    { ruleId: 'semantic-constants/require-named-literal', messageId: 'number' },
  ])
  assert.deepEqual(ruleMessages(`const value = 26`), [
    { ruleId: 'semantic-constants/require-named-literal', messageId: 'name' },
  ])
})

test('keeps structural outcomes and indexes literal while rejecting behavior contracts', () => {
  assert.deepEqual(ruleMessages(`
    expect(notifications).toBe(2)
    expect(client.events).toHaveLength(1)
    expect(callback).toHaveBeenCalledTimes(2)
    rows[2]
  `), [])
  assert.deepEqual(ruleMessages(`expect(response.status()).toBe(400)`), [
    { ruleId: 'semantic-constants/require-named-literal', messageId: 'number' },
  ])
  assert.deepEqual(ruleMessages(`'0'.repeat(26)`), [
    { ruleId: 'semantic-constants/require-named-literal', messageId: 'number' },
  ])
})

test('can exempt numeric data without exempting calendar dates', () => {
  assert.deepEqual(ruleMessages(`const point = [20, 40]; run('2026-08-01')`, {
    named: { numbers: false },
  }), [
    { ruleId: 'semantic-constants/require-named-literal', messageId: 'date' },
  ])
})

test('requires the mapped canonical maxLength contract', () => {
  const filename = 'frontend/src/todos/components/TodoItem.jsx'
  assert.deepEqual(ruleMessages(`
    import { TODO_TEXT_MAX_LENGTH } from '@web-interview/todos/protocol'
    const props = { maxLength: TODO_TEXT_MAX_LENGTH }
  `, { filename }), [])
  assert.deepEqual(ruleMessages(`
    import { TODO_LIST_TITLE_MAX_LENGTH } from '@web-interview/todos/protocol'
    const props = { maxLength: TODO_LIST_TITLE_MAX_LENGTH }
  `, { filename }), [
    { ruleId: 'semantic-constants/require-canonical-contract', messageId: 'canonical' },
  ])
  assert.deepEqual(ruleMessages(`const props = { maxLength: 1000 }`, { filename }), [
    { ruleId: 'semantic-constants/require-canonical-contract', messageId: 'canonical' },
    { ruleId: 'semantic-constants/require-named-literal', messageId: 'number' },
  ])
})

test('requires string conversion at a mapped DOM boundary', () => {
  const filename = 'frontend/src/todos/components/TodoComposer.stories.jsx'
  assert.deepEqual(ruleMessages(`
    import { TODO_TEXT_MAX_LENGTH as textLimit } from '@web-interview/todos/protocol'
    expect(field).toHaveAttribute('maxlength', String(textLimit))
  `, { filename, jsx: true }), [])
  assert.deepEqual(ruleMessages(`
    import { TODO_TEXT_MAX_LENGTH } from '@web-interview/todos/protocol'
    expect(field).toHaveAttribute('maxlength', TODO_TEXT_MAX_LENGTH)
  `, { filename, jsx: true }), [
    { ruleId: 'semantic-constants/require-canonical-contract', messageId: 'canonical' },
  ])
})

test('reports ambiguous contract usages instead of guessing', () => {
  assert.deepEqual(ruleMessages(`const props = { maxLength: SOME_LIMIT }`), [
    { ruleId: 'semantic-constants/require-canonical-contract', messageId: 'ambiguous' },
  ])
})

test('rejects laundering a configured contract through a local constant', () => {
  assert.deepEqual(ruleMessages(`const TODO_MAX_LENGTH = 1000`), [
    { ruleId: 'semantic-constants/require-canonical-contract', messageId: 'canonical' },
  ])
})
