import { fetchTodoReadModel, syncTodoLists } from '../api/todoLists'

const DATABASE_VERSION = 1
const STORE_NAME = 'replica'
const STATE_KEY = 'todo-state'

const emptyReplica = () => ({
  hasReplica: false,
  basis: 0,
  authoritativeReadModel: {},
  pendingTransactions: [],
})

const openDatabase = (indexedDb, databaseName) =>
  new Promise((resolve, reject) => {
    const request = indexedDb.open(databaseName, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const readState = (database) =>
  new Promise((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .get(STATE_KEY)
    request.onsuccess = () => resolve(request.result ?? null)
    request.onerror = () => reject(request.error)
  })

const writeState = (database, state) =>
  new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(state, STATE_KEY)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })

export class IndexedDbReplicaStorage {
  authoritative = false

  constructor({
    indexedDb = globalThis.indexedDB,
    databaseName = 'web-interview-todos-v1',
    api = { fetchTodoReadModel, syncTodoLists },
  } = {}) {
    this.indexedDb = indexedDb
    this.databaseName = databaseName
    this.api = api
    this.database = null
    this.replica = emptyReplica()
    this.localWrites = Promise.resolve()
    this.controller = null
  }

  async load() {
    if (this.indexedDb) {
      this.database = await openDatabase(this.indexedDb, this.databaseName)
      this.replica = (await readState(this.database)) ?? emptyReplica()
    }
    return structuredClone(this.replica)
  }

  #queueLocalWrite(update) {
    const operation = this.localWrites.then(async () => {
      this.replica = update(this.replica)
      if (this.database) await writeState(this.database, this.replica)
    })
    this.localWrites = operation.catch(() => {})
    return operation
  }

  async append(transaction) {
    await this.#queueLocalWrite((replica) => ({
      ...replica,
      pendingTransactions: replica.pendingTransactions.some(
        (pending) => pending.id === transaction.id
      )
        ? replica.pendingTransactions
        : [...replica.pendingTransactions, transaction],
    }))
    return { transaction, authoritative: false }
  }

  async sync({ basis, pendingTransactions }) {
    await this.localWrites
    this.controller?.abort()
    this.controller = new AbortController()

    const response = this.replica.hasReplica
      ? await this.api.syncTodoLists({
          basis,
          transactions: pendingTransactions,
          signal: this.controller.signal,
        })
      : {
          ...(await this.api.fetchTodoReadModel({ signal: this.controller.signal })),
          acceptedTransactionIds: [],
          rejectedTransactions: [],
        }

    const accepted = new Set(response.acceptedTransactionIds)
    const rejected = new Set(response.rejectedTransactions.map((entry) => entry.id))
    await this.#queueLocalWrite((replica) => ({
      hasReplica: true,
      basis: response.basis,
      authoritativeReadModel: response.todoLists,
      pendingTransactions: replica.pendingTransactions.filter(
        (transaction) => !accepted.has(transaction.id) && !rejected.has(transaction.id)
      ),
    }))

    return {
      basis: response.basis,
      authoritativeReadModel: response.todoLists,
      acceptedTransactionIds: response.acceptedTransactionIds,
      rejectedTransactions: response.rejectedTransactions,
    }
  }

  async close() {
    this.controller?.abort()
    await this.localWrites
    this.database?.close()
    this.database = null
  }
}

export const createIndexedDbReplicaStorage = (options) =>
  new IndexedDbReplicaStorage(options)
