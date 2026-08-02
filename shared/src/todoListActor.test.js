import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createTodoListActor } from './todoListActor.js'
import { ERROR_CODE, SYNC_STATUS } from './todoProtocol.js'
import { patchTodoTransaction } from './transactions.js'

const seedLists = {
  list: {
    id: 'list',
    title: 'List',
    todos: [
      { id: 'todo', text: 'Original', completed: false, dueDate: null },
    ],
  },
}

const memoryStorage = ({ authoritative = false } = {}) => {
  const appended = []
  return {
    authoritative,
    appended,
    async load() {
      return {
        hasReplica: true,
        basis: 1,
        authoritativeReadModel: seedLists,
        pendingTransactions: [],
      }
    },
    async append(transaction) {
      const persisted = authoritative
        ? {
            ...transaction,
            serverSeq: 2,
            serverAt: '2026-08-02T12:00:02.000Z',
          }
        : transaction
      appended.push(persisted)
      return { transaction: persisted, authoritative }
    },
  }
}

describe('shared todo-list actor', () => {
  it('runs against authoritative server storage', async () => {
    const storage = memoryStorage({ authoritative: true })
    const actor = createTodoListActor({ storage })
    await actor.start()
    const todo = actor.getSnapshot().readModel.list.todos[0]
    const transaction = patchTodoTransaction({
      basis: 1,
      clientId: 'server-test',
      listId: 'list',
      todo,
      patch: { text: 'Persisted' },
    })

    await actor.transact(transaction)

    assert.equal(actor.getSnapshot().authoritativeReadModel.list.todos[0].text, 'Persisted')
    assert.equal(actor.getSnapshot().basis, 2)
    assert.equal(storage.appended.length, 1)
    await actor.stop()
  })

  it('publishes optimistic state and queues client transactions', async () => {
    const storage = memoryStorage()
    const actor = createTodoListActor({ storage })
    await actor.start()
    const todo = actor.getSnapshot().readModel.list.todos[0]
    const transaction = patchTodoTransaction({
      basis: 1,
      clientId: 'client-test',
      listId: 'list',
      todo,
      patch: { text: 'Offline edit' },
    })

    const persisted = actor.transact(transaction)
    assert.equal(actor.getSnapshot().readModel.list.todos[0].text, 'Offline edit')
    await persisted

    assert.equal(actor.getSnapshot().authoritativeReadModel.list.todos[0].text, 'Original')
    assert.equal(actor.getSnapshot().pendingTransactions.length, 1)
    await actor.stop()
  })

  it('uses the injected retry-delay policy after synchronization fails', async () => {
    const scheduled = []
    const clock = {
      clearTimeout: () => {},
      setTimeout: (callback, delay) => {
        scheduled.push({ callback, delay })
        return scheduled.length
      },
    }
    const storage = memoryStorage()
    storage.sync = async () => {
      const error = Object.assign(new Error('Offline'), {
        code: ERROR_CODE.NETWORK,
      })
      throw error
    }
    const actor = createTodoListActor({
      storage,
      clock,
      retryDelay: (attempt) => attempt * 123,
    })

    await actor.start()
    const initialSync = scheduled.shift()
    assert.equal(initialSync.delay, 0)
    initialSync.callback()
    await new Promise((resolve) => setImmediate(resolve))

    assert.equal(actor.getSnapshot().syncStatus, SYNC_STATUS.OFFLINE)
    assert.equal(scheduled.at(-1).delay, 123)
    await actor.stop()
  })
})
