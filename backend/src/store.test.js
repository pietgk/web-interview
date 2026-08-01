import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createStore, STORE_ERROR } from './store.js'
import { createSeedTodoLists } from './seed.js'

describe('todo list store', () => {
  let store

  beforeEach(() => {
    store = createStore()
  })

  it('returns seeded lists', () => {
    const lists = store.getAll()
    assert.deepEqual(Object.keys(lists).sort(), ['0000000001', '0000000002'])
    assert.equal(lists['0000000001'].title, 'First List')
    assert.equal(lists['0000000001'].todos[0].text, 'First todo of first list!')
  })

  it('updates todos for an existing list', () => {
    const todos = [
      {
        id: 't1',
        text: 'Updated',
        completed: true,
        dueDate: '2026-08-01',
      },
    ]

    const result = store.updateTodos('0000000001', todos)

    assert.equal(result.ok, true)
    assert.deepEqual(result.list.todos, todos)
    assert.deepEqual(store.getById('0000000001').todos, todos)
  })

  it('returns TODO_LIST_NOT_FOUND for unknown list', () => {
    const result = store.updateTodos('missing', [])
    assert.equal(result.ok, false)
    assert.equal(result.code, STORE_ERROR.TODO_LIST_NOT_FOUND)
  })

  it('returns INVALID_TODOS for invalid todos payload', () => {
    const result = store.updateTodos('0000000001', [{ text: 'nope' }])
    assert.equal(result.ok, false)
    assert.equal(result.code, STORE_ERROR.INVALID_TODOS)
    assert.equal(result.body.code, 'VALIDATION_ERROR')
  })

  it('rejects an impossible calendar date', () => {
    const result = store.updateTodos('0000000001', [
      {
        id: 't1',
        text: 'Bad date',
        completed: false,
        dueDate: '2026-02-31',
      },
    ])

    assert.equal(result.ok, false)
    assert.equal(result.code, STORE_ERROR.INVALID_TODOS)
  })

  it('rejects duplicate todo ids', () => {
    const result = store.updateTodos('0000000001', [
      { id: 't1', text: 'A', completed: false, dueDate: null },
      { id: 't1', text: 'B', completed: true, dueDate: null },
    ])

    assert.equal(result.ok, false)
    assert.equal(result.code, STORE_ERROR.INVALID_TODOS)
  })

  it('does not mutate seed when cloning', () => {
    const seed = createSeedTodoLists()
    const localStore = createStore(seed)
    localStore.updateTodos('0000000001', [])
    assert.equal(seed['0000000001'].todos.length, 1)
  })
})
