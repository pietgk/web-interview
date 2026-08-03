import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseTodoList,
  todoSchema,
  todosSchema,
} from './todoContract.js'

describe('todo contract', () => {
  it('rejects days that do not exist in their month', () => {
    for (const dueDate of ['2026-02-29', '2024-02-30', '2026-04-31']) {
      const result = todoSchema.safeParse({
        id: 't1',
        text: 'Bad date',
        completed: false,
        dueDate,
      })

      assert.equal(result.success, false, `${dueDate} should be rejected`)
      assert.ok(
        result.error.issues.some((issue) =>
          issue.message.includes('real calendar date')
        )
      )
    }
  })

  it('accepts February 29 only in leap years', () => {
    for (const dueDate of ['2024-02-29', '2000-02-29']) {
      const result = todoSchema.safeParse({
        id: 't1',
        text: 'Leap day',
        completed: false,
        dueDate,
      })

      assert.equal(result.success, true, `${dueDate} should be accepted`)
    }

    const nonLeapCentury = todoSchema.safeParse({
      id: 't1',
      text: 'Not a leap day',
      completed: false,
      dueDate: '1900-02-29',
    })
    assert.equal(nonLeapCentury.success, false)
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

  it('accepts a valid todo with a calendar due date', () => {
    const result = todoSchema.safeParse({
      id: 't1',
      text: '',
      completed: false,
      dueDate: '2026-07-31',
    })
    assert.equal(result.success, true)
    assert.equal(result.data.dueDate, '2026-07-31')
  })
})
