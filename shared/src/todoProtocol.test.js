import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { todoSchema } from './todoContract.js'
import {
  ATTRIBUTE,
  datomSchema,
  syncTodoListsRequestSchema,
} from './todoDatabase.js'
import {
  SYNC_TRANSACTION_LIMIT,
  TODO_TEXT_MAX_LENGTH,
  TRANSACTION_VERSION,
} from './todoProtocol.js'
import {
  createTodoListAtBottomTransaction,
  createTodoAtTopTransaction,
  createTransaction,
  patchTodoListTitleTransaction,
} from './transactions.js'

/** @param {number} index */
const transactionAt = (index) =>
  createTransaction({
    basis: 0,
    clientId: 'protocol-test',
    cause: 'protocol.test',
    datoms: [[`todo-${index}`, ATTRIBUTE.TODO_TEXT, 'text']],
    id: `transaction-${index}`,
    occurredAt: '2026-08-02T00:00:00.000Z',
  })

describe('todo protocol constants', () => {
  it('uses one todo text limit for read models and datoms', () => {
    const acceptedText = 'x'.repeat(TODO_TEXT_MAX_LENGTH)
    const rejectedText = `${acceptedText}x`

    assert.equal(todoSchema.safeParse({
      id: 'todo',
      text: acceptedText,
      completed: false,
      dueDate: null,
    }).success, true)
    assert.equal(todoSchema.safeParse({
      id: 'todo',
      text: rejectedText,
      completed: false,
      dueDate: null,
    }).success, false)
    assert.equal(datomSchema.safeParse([
      'todo',
      ATTRIBUTE.TODO_TEXT,
      acceptedText,
      'transaction',
      true,
    ]).success, true)
    assert.equal(datomSchema.safeParse([
      'todo',
      ATTRIBUTE.TODO_TEXT,
      rejectedText,
      'transaction',
      true,
    ]).success, false)
  })

  it('publishes the sync batch limit in the request contract', () => {
    const transactions = Array.from(
      { length: SYNC_TRANSACTION_LIMIT },
      (_, index) => transactionAt(index)
    )

    assert.equal(syncTodoListsRequestSchema.safeParse({
      basis: 0,
      transactions,
    }).success, true)
    assert.equal(syncTodoListsRequestSchema.safeParse({
      basis: 0,
      transactions: [...transactions, transactionAt(SYNC_TRANSACTION_LIMIT)],
    }).success, false)
  })

  it('uses the shared transaction version and injectable top-order clock', () => {
    const transaction = createTodoAtTopTransaction({
      basis: 0,
      clientId: 'protocol-test',
      listId: 'list',
      now: () => 1234,
      todo: {
        id: 'todo',
        text: 'Text',
        completed: false,
        dueDate: null,
      },
    })

    assert.equal(transaction.version, TRANSACTION_VERSION)
    assert.deepEqual(
      transaction.datoms.find((datom) => datom[1] === ATTRIBUTE.TODO_ORDER),
      ['todo', ATTRIBUTE.TODO_ORDER, -1234, transaction.id, true]
    )
  })

  it('creates a Todo List atomically with title, order, and visible state', () => {
    const transaction = createTodoListAtBottomTransaction({
      basis: 3,
      clientId: 'protocol-test',
      listId: 'new-list',
      title: 'Release checklist',
      now: () => 1234,
    })

    assert.equal(transaction.origin.listId, 'new-list')
    assert.deepEqual(transaction.datoms, [
      ['new-list', ATTRIBUTE.LIST_TITLE, 'Release checklist', transaction.id, true],
      ['new-list', ATTRIBUTE.LIST_ORDER, 1234, transaction.id, true],
      ['new-list', ATTRIBUTE.LIST_DELETED, false, transaction.id, true],
    ])
  })

  it('patches a Todo List title only when its trimmed value changes', () => {
    const todoList = { id: 'list', title: 'Original', todos: [] }
    assert.equal(patchTodoListTitleTransaction({
      basis: 3,
      clientId: 'protocol-test',
      todoList,
      title: '  Original  ',
    }), null)

    const transaction = patchTodoListTitleTransaction({
      basis: 3,
      clientId: 'protocol-test',
      todoList,
      title: '  Renamed  ',
    })
    assert.ok(transaction)
    assert.equal(transaction.origin.listId, 'list')
    assert.deepEqual(transaction.datoms, [
      ['list', ATTRIBUTE.LIST_TITLE, 'Renamed', transaction.id, true],
    ])
  })
})
