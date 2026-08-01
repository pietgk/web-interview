import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { constants as HTTP } from 'node:http2'
import request from 'supertest'
import { createApp } from './app.js'
import { createStore, STORE_ERROR } from './store.js'

describe('todo lists API', () => {
  let app
  let store

  beforeEach(() => {
    store = createStore()
    app = createApp(store)
  })

  it('GET /api/todo-lists returns seeded lists', async () => {
    const response = await request(app).get('/api/todo-lists')

    assert.equal(response.status, HTTP.HTTP_STATUS_OK)
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

    assert.equal(putResponse.status, HTTP.HTTP_STATUS_OK)
    assert.deepEqual(putResponse.body.todos, todos)

    const getResponse = await request(app).get('/api/todo-lists')
    assert.deepEqual(getResponse.body['0000000001'].todos, todos)
  })

  it('PUT returns NOT_FOUND for unknown list', async () => {
    const response = await request(app).put('/api/todo-lists/nope').send({ todos: [] })

    assert.equal(response.status, HTTP.HTTP_STATUS_NOT_FOUND)
    assert.equal(response.body.error, 'Todo list not found')
    assert.equal(response.body.code, STORE_ERROR.TODO_LIST_NOT_FOUND)
  })

  it('PUT returns BAD_REQUEST for invalid body', async () => {
    const response = await request(app)
      .put('/api/todo-lists/0000000001')
      .send({ todos: 'not-an-array' })

    assert.equal(response.status, HTTP.HTTP_STATUS_BAD_REQUEST)
    assert.equal(response.body.code, 'VALIDATION_ERROR')
  })

  it('PUT returns BAD_REQUEST for impossible calendar dates', async () => {
    const response = await request(app)
      .put('/api/todo-lists/0000000001')
      .send({
        todos: [
          {
            id: 't1',
            text: 'Nope',
            completed: false,
            dueDate: '2026-02-31',
          },
        ],
      })

    assert.equal(response.status, HTTP.HTTP_STATUS_BAD_REQUEST)
    assert.equal(response.body.code, 'VALIDATION_ERROR')
    assert.ok(Array.isArray(response.body.issues))
  })

  it('PUT returns BAD_REQUEST for duplicate todo ids', async () => {
    const response = await request(app)
      .put('/api/todo-lists/0000000001')
      .send({
        todos: [
          { id: 't1', text: 'A', completed: false, dueDate: null },
          { id: 't1', text: 'B', completed: false, dueDate: null },
        ],
      })

    assert.equal(response.status, HTTP.HTTP_STATUS_BAD_REQUEST)
    assert.equal(response.body.code, 'VALIDATION_ERROR')
  })

  it('returns JSON for malformed JSON bodies', async () => {
    const response = await request(app)
      .put('/api/todo-lists/0000000001')
      .set('Content-Type', 'application/json')
      .send('{"todos":')

    assert.equal(response.status, HTTP.HTTP_STATUS_BAD_REQUEST)
    assert.equal(response.body.code, 'MALFORMED_JSON')
  })
})
