import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { constants as HTTP } from 'node:http2'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import {
  ERROR_CODE,
  TODO_API_PATH,
} from '@web-interview/todos/protocol'
import { patchTodoTransaction } from '@web-interview/todos/transactions'
import { createApp } from './app.js'
import { createServerTodoActor } from './todos/createServerTodoActor.js'

describe('todo lists API', () => {
  /** @type {import('express').Express} */
  let app
  /** @type {import('@web-interview/todos/actor').TodoListActor} */
  let actor
  /** @type {string} */
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

  it('GET /read-model returns seeded lists with basis', async () => {
    const response = await request(app).get(TODO_API_PATH.READ_MODEL)

    assert.equal(response.status, HTTP.HTTP_STATUS_OK)
    assert.equal(response.body.basis, 1)
    assert.equal(response.body.todoLists['0000000001'].title, 'First List')
    assert.equal(response.body.todoLists['0000000002'].todos[0].completed, false)
  })

  it('emits CORS headers only for configured origins', async () => {
    const configuredApp = createApp(actor, {
      corsOrigins: ['https://allowed.example'],
    })
    const allowed = await request(configuredApp)
      .get(TODO_API_PATH.READ_MODEL)
      .set('Origin', 'https://allowed.example')
    const rejected = await request(configuredApp)
      .get(TODO_API_PATH.READ_MODEL)
      .set('Origin', 'https://rejected.example')

    assert.equal(
      allowed.headers['access-control-allow-origin'],
      'https://allowed.example'
    )
    assert.equal(rejected.headers['access-control-allow-origin'], undefined)
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
    assert.ok(transaction)

    const response = await request(app)
      .post(TODO_API_PATH.SYNC)
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
    assert.ok(transaction)

    const first = await request(app)
      .post(TODO_API_PATH.SYNC)
      .send({ basis: 1, transactions: [transaction] })
    const second = await request(app)
      .post(TODO_API_PATH.SYNC)
      .send({ basis: 1, transactions: [transaction] })

    assert.equal(first.body.basis, 2)
    assert.equal(second.body.basis, 2)
    assert.deepEqual(second.body.acceptedTransactionIds, [transaction.id])
  })

  it('rejects invalid sync bodies without changing the read model', async () => {
    const before = actor.getSnapshot().authoritativeReadModel
    const response = await request(app)
      .post(TODO_API_PATH.SYNC)
      .send({ basis: 1, transactions: [{ nope: true }] })

    assert.equal(response.status, HTTP.HTTP_STATUS_BAD_REQUEST)
    assert.equal(response.body.code, ERROR_CODE.VALIDATION)
    assert.deepEqual(actor.getSnapshot().authoritativeReadModel, before)
  })

  it('returns JSON for malformed JSON bodies', async () => {
    const response = await request(app)
      .post(TODO_API_PATH.SYNC)
      .set('Content-Type', 'application/json')
      .send('{"basis":')

    assert.equal(response.status, HTTP.HTTP_STATUS_BAD_REQUEST)
    assert.equal(response.body.code, ERROR_CODE.MALFORMED_JSON)
  })
})
