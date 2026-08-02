import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { constants as HTTP } from 'node:http2'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { patchTodoTransaction } from '@web-interview/todos/transactions'
import { createApp } from './app.js'
import { createServerTodoActor } from './todos/createServerTodoActor.js'

describe('todo lists API', () => {
  let app
  let actor
  let directory

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'todo-api-'))
    actor = await createServerTodoActor({
      filePath: join(directory, 'todos.jsonl'),
    })
    app = createApp(actor)
  })

  afterEach(async () => {
    await actor.stop()
    await rm(directory, { recursive: true, force: true })
  })

  it('GET /api/todo-lists returns seeded lists', async () => {
    const response = await request(app).get('/api/todo-lists')

    assert.equal(response.status, HTTP.HTTP_STATUS_OK)
    assert.equal(response.body['0000000001'].title, 'First List')
    assert.equal(response.body['0000000002'].todos[0].completed, false)
  })

  it('GET /read-model returns the actor basis and read model', async () => {
    const response = await request(app).get('/api/todo-lists/read-model')

    assert.equal(response.status, HTTP.HTTP_STATUS_OK)
    assert.equal(response.body.basis, 1)
    assert.equal(response.body.todoLists['0000000001'].title, 'First List')
  })

  it('POST /sync atomically persists datom transactions', async () => {
    const snapshot = actor.getSnapshot()
    const todo = snapshot.readModel['0000000001'].todos[0]
    const transaction = patchTodoTransaction({
      basis: snapshot.basis,
      clientId: 'api-test',
      listId: '0000000001',
      todo,
      patch: { text: 'Synced datom' },
    })

    const response = await request(app)
      .post('/api/todo-lists/sync')
      .send({ basis: snapshot.basis, transactions: [transaction] })

    assert.equal(response.status, HTTP.HTTP_STATUS_OK)
    assert.deepEqual(response.body.acceptedTransactionIds, [transaction.id])
    assert.equal(
      response.body.todoLists['0000000001'].todos[0].text,
      'Synced datom'
    )
    assert.equal(response.body.basis, 2)
  })

  it('deduplicates a transaction retried after an uncertain response', async () => {
    const snapshot = actor.getSnapshot()
    const todo = snapshot.readModel['0000000001'].todos[0]
    const transaction = patchTodoTransaction({
      basis: snapshot.basis,
      clientId: 'api-test',
      listId: '0000000001',
      todo,
      patch: { completed: true },
    })

    const first = await request(app)
      .post('/api/todo-lists/sync')
      .send({ basis: 1, transactions: [transaction] })
    const second = await request(app)
      .post('/api/todo-lists/sync')
      .send({ basis: 1, transactions: [transaction] })

    assert.equal(first.body.basis, 2)
    assert.equal(second.body.basis, 2)
    assert.deepEqual(second.body.acceptedTransactionIds, [transaction.id])
  })

  it('PUT whole-list replacement persists todos and deletes omitted todos', async () => {
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

  it('PUT returns NOT_FOUND for an unknown list', async () => {
    const response = await request(app).put('/api/todo-lists/nope').send({ todos: [] })

    assert.equal(response.status, HTTP.HTTP_STATUS_NOT_FOUND)
    assert.equal(response.body.code, 'TODO_LIST_NOT_FOUND')
  })

  it('rejects invalid sync bodies without changing the read model', async () => {
    const before = actor.getSnapshot().authoritativeReadModel
    const response = await request(app)
      .post('/api/todo-lists/sync')
      .send({ basis: 1, transactions: [{ nope: true }] })

    assert.equal(response.status, HTTP.HTTP_STATUS_BAD_REQUEST)
    assert.equal(response.body.code, 'VALIDATION_ERROR')
    assert.deepEqual(actor.getSnapshot().authoritativeReadModel, before)
  })

  it('returns JSON for malformed JSON bodies', async () => {
    const response = await request(app)
      .post('/api/todo-lists/sync')
      .set('Content-Type', 'application/json')
      .send('{"basis":')

    assert.equal(response.status, HTTP.HTTP_STATUS_BAD_REQUEST)
    assert.equal(response.body.code, 'MALFORMED_JSON')
  })
})
