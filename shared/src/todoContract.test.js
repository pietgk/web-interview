import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseTodoList,
  parseUpdateTodosRequest,
  todosSchema,
} from './todoContract.js'
import { ERROR_CODE } from './todoProtocol.js'

describe('todo contract', () => {
  it('rejects days that do not exist in their month', () => {
    for (const dueDate of ['2026-02-29', '2024-02-30', '2026-04-31']) {
      const result = parseUpdateTodosRequest({
        todos: [
          {
            id: 't1',
            text: 'Bad date',
            completed: false,
            dueDate,
          },
        ],
      })

      assert.equal(result.ok, false, `${dueDate} should be rejected`)
      assert.ok(result.body)
      assert.equal(result.body.code, ERROR_CODE.VALIDATION)
      assert.ok(
        result.body.issues.some((issue) =>
          issue.message.includes('real calendar date')
        )
      )
    }
  })

  it('accepts February 29 only in leap years', () => {
    for (const dueDate of ['2024-02-29', '2000-02-29']) {
      const result = parseUpdateTodosRequest({
        todos: [
          {
            id: 't1',
            text: 'Leap day',
            completed: false,
            dueDate,
          },
        ],
      })

      assert.equal(result.ok, true, `${dueDate} should be accepted`)
    }

    const nonLeapCentury = parseUpdateTodosRequest({
      todos: [
        {
          id: 't1',
          text: 'Not a leap day',
          completed: false,
          dueDate: '1900-02-29',
        },
      ],
    })
    assert.equal(nonLeapCentury.ok, false)
  })

  it('rejects duplicate todo ids', () => {
    const result = todosSchema.safeParse([
      { id: 't1', text: 'A', completed: false, dueDate: null },
      { id: 't1', text: 'B', completed: true, dueDate: null },
    ])

    assert.equal(result.success, false)
  })

  it('rejects empty todo ids', () => {
    const result = todosSchema.safeParse([
      { id: '', text: 'A', completed: false, dueDate: null },
    ])
    assert.equal(result.success, false)
  })

  it('rejects unknown properties', () => {
    const result = parseTodoList({
      id: '1',
      title: 'List',
      todos: [{ id: 't1', text: '', completed: false, dueDate: null, extra: true }],
    })
    assert.equal(result.ok, false)
  })

  it('accepts a valid update request', () => {
    const result = parseUpdateTodosRequest({
      todos: [
        {
          id: 't1',
          text: '',
          completed: false,
          dueDate: '2026-07-31',
        },
      ],
    })
    assert.equal(result.ok, true)
    assert.ok(result.data)
    assert.equal(result.data.todos[0].dueDate, '2026-07-31')
  })
})
