import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyTransaction,
  databaseFromReadModel,
  projectTodoLists,
  readModelAsOf,
  replayTransactions,
  syncTodoListsRequestSchema,
} from './todoDatabase.js'
import {
  createTodoTransaction,
  deleteTodoListTransaction,
  patchTodoTransaction,
  seedTransactionFromTodoLists,
} from './transactions.js'

/** @typedef {import('./types.js').Transaction} Transaction */

const seedLists = {
  list: {
    id: 'list',
    title: 'List',
    todos: [
      {
        id: 'todo',
        text: 'Original',
        completed: false,
        dueDate: null,
      },
    ],
  },
}

/**
 * @param {Transaction} transaction
 * @param {number} serverSeq
 * @returns {Transaction}
 */
const serverTransaction = (transaction, serverSeq) => ({
  ...transaction,
  serverSeq,
  serverAt: `2026-08-02T12:00:0${serverSeq}.000Z`,
})

/**
 * @param {Transaction | null} transaction
 * @returns {Transaction}
 */
const requiredTransaction = (transaction) => {
  assert.ok(transaction)
  return transaction
}

describe('todo datom database', () => {
  it('replays immutable transactions into the todo-list read model', () => {
    const genesis = serverTransaction(
      seedTransactionFromTodoLists({ todoLists: seedLists }),
      1
    )
    const patch = serverTransaction(
      requiredTransaction(patchTodoTransaction({
        basis: 1,
        clientId: 'test',
        listId: 'list',
        todo: seedLists.list.todos[0],
        patch: { text: 'Updated', completed: true },
      })),
      2
    )

    const database = replayTransactions([genesis, patch])

    assert.deepEqual(projectTodoLists(database), {
      list: {
        id: 'list',
        title: 'List',
        todos: [
          {
            id: 'todo',
            text: 'Updated',
            completed: true,
            dueDate: null,
          },
        ],
      },
    })
    assert.equal(database.basis, 2)
  })

  it('expands cardinality-one replacement into a retraction and assertion', () => {
    const database = databaseFromReadModel(seedLists, 1)
    const transaction = patchTodoTransaction({
      basis: 1,
      clientId: 'test',
      listId: 'list',
      todo: seedLists.list.todos[0],
      patch: { text: 'Updated' },
    })
    assert.ok(transaction)

    const result = applyTransaction(database, transaction)

    assert.deepEqual(result.transaction.datoms, [
      ['todo', 'todo/text', 'Original', transaction.id, false],
      ['todo', 'todo/text', 'Updated', transaction.id, true],
    ])
  })

  it('applies every transaction atomically', () => {
    const database = databaseFromReadModel(seedLists, 1)
    const invalid = createTodoTransaction({
      basis: 1,
      clientId: 'test',
      listId: 'missing',
      order: 0,
      todo: {
        id: 'new',
        text: 'Should not appear',
        completed: false,
        dueDate: null,
      },
    })

    assert.throws(() => applyTransaction(database, invalid), /unknown list/)
    assert.deepEqual(projectTodoLists(database), seedLists)
  })

  it('rejects datoms whose transaction id differs from the envelope', () => {
    const transaction = seedTransactionFromTodoLists({ todoLists: seedLists })
    transaction.datoms[0][3] = 'tx-different'

    const result = syncTodoListsRequestSchema.safeParse({
      basis: 0,
      transactions: [transaction],
    })

    assert.equal(result.success, false)
    assert.deepEqual(result.error.issues[0].path, ['transactions', 0, 'datoms', 0, 3])
  })

  it('supports deterministic as-of read models', () => {
    const genesis = serverTransaction(
      seedTransactionFromTodoLists({ todoLists: seedLists }),
      1
    )
    const patch = serverTransaction(
      requiredTransaction(patchTodoTransaction({
        basis: 1,
        clientId: 'test',
        listId: 'list',
        todo: seedLists.list.todos[0],
        patch: { text: 'Future' },
      })),
      2
    )

    assert.equal(readModelAsOf([genesis, patch], 1).list.todos[0].text, 'Original')
    assert.equal(readModelAsOf([genesis, patch], 2).list.todos[0].text, 'Future')
  })

  it('hides a deleted Todo List and all of its Todos without retracting history', () => {
    const database = databaseFromReadModel(seedLists, 1)
    const transaction = deleteTodoListTransaction({
      basis: 1,
      clientId: 'test',
      todoList: seedLists.list,
    })

    const result = applyTransaction(database, transaction)

    assert.deepEqual(projectTodoLists(result.database), {})
    assert.equal(result.database.facts.get('list')?.get('list/deleted'), true)
    assert.equal(result.database.facts.get('todo')?.get('todo/list'), 'list')
  })

  it('replays a pre-feature journal transaction without list/deleted', () => {
    const oldGenesis = serverTransaction(
      seedTransactionFromTodoLists({ todoLists: seedLists }),
      1
    )
    oldGenesis.datoms = oldGenesis.datoms.filter(
      (datom) => datom[1] !== 'list/deleted'
    )

    assert.deepEqual(projectTodoLists(replayTransactions([oldGenesis])), seedLists)
  })
})
