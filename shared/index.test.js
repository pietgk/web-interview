import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseTodoList,
  parseUpdateTodosRequest,
  todosSchema,
} from './index.js'

describe('todo contract', () => {
  it('rejects an impossible calendar date', () => {
    const result = parseUpdateTodosRequest({
      todos: [
        {
          id: 't1',
          text: 'Bad date',
          completed: false,
          dueDate: '2026-02-31',
        },
      ],
    })

    assert.equal(result.ok, false)
    assert.equal(result.body.code, 'VALIDATION_ERROR')
    assert.ok(
      result.body.issues.some((issue) =>
        issue.message.includes('real calendar date')
      )
    )
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
    assert.equal(result.data.todos[0].dueDate, '2026-07-31')
  })
})
