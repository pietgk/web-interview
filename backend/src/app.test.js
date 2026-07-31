import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp } from './app.js'
import { createStore } from './store.js'

describe('todo lists API', () => {
  let app
  let store

  beforeEach(() => {
    store = createStore()
    app = createApp(store)
  })

  it('GET /api/todo-lists returns seeded lists', async () => {
    const response = await request(app).get('/api/todo-lists')

    assert.equal(response.status, 200)
    assert.equal(response.body['0000000001'].title, 'First List')
    assert.equal(response.body['0000000002'].todos[0].completed, false)
  })

  it('PUT /api/todo-lists/:id persists todos for later GET', async () => {
    const todos = [
      {
        id: 'new-1',
        text: 'Persisted todo',
        completed: false,
        dueDate: null,
      },
      {
        id: 'new-2',
        text: 'Done one',
        completed: true,
        dueDate: '2026-07-31',
      },
    ]

    const putResponse = await request(app)
      .put('/api/todo-lists/0000000001')
      .send({ todos })

    assert.equal(putResponse.status, 200)
    assert.deepEqual(putResponse.body.todos, todos)

    const getResponse = await request(app).get('/api/todo-lists')
    assert.deepEqual(getResponse.body['0000000001'].todos, todos)
  })

  it('PUT returns 404 for unknown list', async () => {
    const response = await request(app).put('/api/todo-lists/nope').send({ todos: [] })

    assert.equal(response.status, 404)
    assert.equal(response.body.error, 'Todo list not found')
  })

  it('PUT returns 400 for invalid body', async () => {
    const response = await request(app)
      .put('/api/todo-lists/0000000001')
      .send({ todos: 'not-an-array' })

    assert.equal(response.status, 400)
  })
})
