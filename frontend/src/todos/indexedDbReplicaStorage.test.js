import { IndexedDbReplicaStorage } from './indexedDbReplicaStorage'
import { SYNC_TRANSACTION_LIMIT } from '@web-interview/todos/protocol'
import { IDBFactory } from 'fake-indexeddb'

const emptyReadModel = {
  basis: 0,
  todoLists: {},
}

/** @returns {Promise<void>} */
const deleteDatabase = (indexedDb, databaseName) =>
  new Promise((resolve, reject) => {
    const request = indexedDb.deleteDatabase(databaseName)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })

describe('IndexedDbReplicaStorage', () => {
  it('submits pending transactions in protocol-sized batches', async () => {
    const api = {
      fetchTodoReadModel: vi.fn().mockResolvedValue(emptyReadModel),
      syncTodoLists: vi.fn().mockImplementation(async ({ transactions }) => ({
        ...emptyReadModel,
        acceptedTransactionIds: transactions.map((transaction) => transaction.id),
        rejectedTransactions: [],
      })),
    }
    const storage = new IndexedDbReplicaStorage({ indexedDb: null, api })
    await storage.load()
    await storage.sync({ basis: 0, pendingTransactions: [] })

    const transactions = Array.from(
      { length: SYNC_TRANSACTION_LIMIT + 1 },
      (_, index) => ({ id: `transaction-${index}` })
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
    const transaction = { id: 'pending-transaction' }

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
})
