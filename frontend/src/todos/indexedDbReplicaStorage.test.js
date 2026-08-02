import { IndexedDbReplicaStorage } from './indexedDbReplicaStorage'
import { SYNC_TRANSACTION_LIMIT } from '@web-interview/todos/protocol'
import { createTransaction } from '@web-interview/todos/transactions'
import { IDBFactory } from 'fake-indexeddb'
import {
  REPLICA_DATABASE_VERSION,
  REPLICA_STATE_KEY,
  REPLICA_STORE_NAME,
} from './persistenceConfig'

const emptyReadModel = {
  basis: 0,
  todoLists: {},
}

/**
 * @param {IDBFactory} indexedDb
 * @param {string} databaseName
 * @returns {Promise<void>}
 */
const deleteDatabase = (indexedDb, databaseName) =>
  new Promise((resolve, reject) => {
    const request = indexedDb.deleteDatabase(databaseName)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })

/**
 * @param {IDBFactory} indexedDb
 * @param {string} databaseName
 * @param {unknown} state
 * @returns {Promise<void>}
 */
const writeDatabaseState = async (indexedDb, databaseName, state) => {
  const database = await new Promise((resolve, reject) => {
    const request = indexedDb.open(databaseName, REPLICA_DATABASE_VERSION)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(REPLICA_STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(REPLICA_STORE_NAME, 'readwrite')
    transaction.objectStore(REPLICA_STORE_NAME).put(state, REPLICA_STATE_KEY)
    transaction.oncomplete = () => resolve(undefined)
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}

describe('IndexedDbReplicaStorage', () => {
  it('submits pending transactions in protocol-sized batches', async () => {
    /** @type {typeof import('../api/todoLists').syncTodoLists} */
    const syncImplementation = async ({ transactions }) => ({
      ...emptyReadModel,
      acceptedTransactionIds: transactions.map((transaction) => transaction.id),
      rejectedTransactions: [],
    })
    const api = {
      fetchTodoReadModel: vi.fn().mockResolvedValue(emptyReadModel),
      syncTodoLists: vi.fn().mockImplementation(syncImplementation),
    }
    const storage = new IndexedDbReplicaStorage({ indexedDb: null, api })
    await storage.load()
    await storage.sync({ basis: 0, pendingTransactions: [] })

    const transactions = Array.from(
      { length: SYNC_TRANSACTION_LIMIT + 1 },
      (_, index) => createTransaction({
        basis: 0,
        clientId: 'indexed-db-test',
        cause: 'indexed-db.test',
        datoms: [[`todo-${index}`, 'todo/text', 'text']],
        id: `transaction-${index}`,
      })
    )
    for (const transaction of transactions) await storage.append(transaction)

    await storage.sync({ basis: 0, pendingTransactions: transactions })

    expect(api.syncTodoLists).toHaveBeenLastCalledWith(
      expect.objectContaining({
        transactions: transactions.slice(0, SYNC_TRANSACTION_LIMIT),
      })
    )
    const afterFirstBatch = await storage.load()
    expect(afterFirstBatch.pendingTransactions).toEqual([
      transactions[SYNC_TRANSACTION_LIMIT],
    ])

    await storage.sync({
      basis: afterFirstBatch.basis,
      pendingTransactions: afterFirstBatch.pendingTransactions,
    })
    expect((await storage.load()).pendingTransactions).toEqual([])
    await storage.close()
  })

  it('copies an existing legacy replica into the stable database name', async () => {
    const indexedDb = new IDBFactory()
    const suffix = globalThis.crypto.randomUUID()
    const legacyDatabaseName = `legacy-${suffix}`
    const stableDatabaseName = `stable-${suffix}`
    const transaction = createTransaction({
      basis: 0,
      clientId: 'indexed-db-test',
      cause: 'indexed-db.test',
      datoms: [['todo', 'todo/text', 'text']],
      id: 'pending-transaction',
    })

    const legacy = new IndexedDbReplicaStorage({
      indexedDb,
      databaseName: legacyDatabaseName,
      legacyDatabaseNames: [],
    })
    await legacy.load()
    await legacy.append(transaction)
    await legacy.close()

    const stable = new IndexedDbReplicaStorage({
      indexedDb,
      databaseName: stableDatabaseName,
      legacyDatabaseNames: [legacyDatabaseName],
    })
    const migrated = await stable.load()

    expect(migrated.pendingTransactions).toEqual([transaction])
    await stable.close()

    const reopened = new IndexedDbReplicaStorage({
      indexedDb,
      databaseName: stableDatabaseName,
      legacyDatabaseNames: [],
    })
    expect((await reopened.load()).pendingTransactions).toEqual([transaction])
    await reopened.close()

    await deleteDatabase(indexedDb, legacyDatabaseName)
    await deleteDatabase(indexedDb, stableDatabaseName)
  })

  it('ignores an invalid persisted replica instead of trusting its shape', async () => {
    const indexedDb = new IDBFactory()
    const databaseName = `invalid-${globalThis.crypto.randomUUID()}`
    await writeDatabaseState(indexedDb, databaseName, {
      hasReplica: true,
      basis: 'not-a-number',
      authoritativeReadModel: {},
      pendingTransactions: [],
    })

    const storage = new IndexedDbReplicaStorage({
      indexedDb,
      databaseName,
      legacyDatabaseNames: [],
    })

    await expect(storage.load()).resolves.toEqual({
      hasReplica: false,
      basis: 0,
      authoritativeReadModel: {},
      pendingTransactions: [],
    })
    await storage.close()
    await deleteDatabase(indexedDb, databaseName)
  })
})
