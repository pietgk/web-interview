import { fetchTodoReadModel, syncTodoLists } from '../api/todoLists'
import { todoListsSchema } from '@web-interview/todos/contract'
import { transactionSchema } from '@web-interview/todos/database'
import { SYNC_TRANSACTION_LIMIT } from '@web-interview/todos/protocol'
import { z } from 'zod'
import {
  LEGACY_REPLICA_DATABASE_NAMES,
  REPLICA_DATABASE_NAME,
  REPLICA_DATABASE_VERSION,
  REPLICA_STATE_KEY,
  REPLICA_STORE_NAME,
} from './persistenceConfig'

/** @typedef {import('@web-interview/todos/types').TodoStorageLoadResult} Replica */
/** @typedef {import('@web-interview/todos/types').TodoStorageSyncInput} TodoStorageSyncInput */
/** @typedef {import('@web-interview/todos/types').Transaction} Transaction */

const replicaSchema = z.object({
  hasReplica: z.boolean(),
  basis: z.number().int().nonnegative(),
  authoritativeReadModel: todoListsSchema,
  pendingTransactions: z.array(transactionSchema),
}).strict()

/** @returns {Replica} */
const emptyReplica = () => ({
  hasReplica: false,
  basis: 0,
  authoritativeReadModel: {},
  pendingTransactions: [],
})

/**
 * @typedef {object} IndexedDbReplicaStorageOptions
 * @property {IDBFactory | null} [indexedDb]
 * @property {string} [databaseName]
 * @property {number} [databaseVersion]
 * @property {string[]} [legacyDatabaseNames]
 * @property {string} [stateKey]
 * @property {string} [storeName]
 * @property {{
 *   fetchTodoReadModel: typeof fetchTodoReadModel,
 *   syncTodoLists: typeof syncTodoLists
 * }} [api]
 */

/**
 * @param {unknown} value
 * @returns {Replica | null}
 */
const parseReplica = (value) => {
  const parsed = replicaSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * @param {IDBFactory} indexedDb
 * @param {string} databaseName
 * @param {number} databaseVersion
 * @param {string} storeName
 * @returns {Promise<{database: IDBDatabase, created: boolean}>}
 */
const openDatabase = (indexedDb, databaseName, databaseVersion, storeName) =>
  new Promise((resolve, reject) => {
    const request = indexedDb.open(databaseName, databaseVersion)
    let created = false
    request.onupgradeneeded = (event) => {
      created = event.oldVersion === 0
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName)
      }
    }
    request.onsuccess = () => resolve({ database: request.result, created })
    request.onerror = () => reject(request.error)
  })

/**
 * @param {IDBDatabase} database
 * @param {string} storeName
 * @param {string} stateKey
 * @returns {Promise<unknown | null>}
 */
const readState = (database, storeName, stateKey) =>
  new Promise((resolve, reject) => {
    const request = database
      .transaction(storeName, 'readonly')
      .objectStore(storeName)
      .get(stateKey)
    request.onsuccess = () => resolve(request.result ?? null)
    request.onerror = () => reject(request.error)
  })

/**
 * @param {IDBDatabase} database
 * @param {string} storeName
 * @param {string} stateKey
 * @param {Replica} state
 * @returns {Promise<void>}
 */
const writeState = (database, storeName, stateKey, state) =>
  new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).put(state, stateKey)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })

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
    request.onblocked = () => reject(new Error(`Database ${databaseName} is blocked`))
  })

export class IndexedDbReplicaStorage {
  authoritative = false

  /** @param {IndexedDbReplicaStorageOptions} [options] */
  constructor({
    indexedDb = globalThis.indexedDB,
    databaseName = REPLICA_DATABASE_NAME,
    databaseVersion = REPLICA_DATABASE_VERSION,
    legacyDatabaseNames,
    stateKey = REPLICA_STATE_KEY,
    storeName = REPLICA_STORE_NAME,
    api = { fetchTodoReadModel, syncTodoLists },
  } = {}) {
    this.indexedDb = indexedDb
    this.databaseName = databaseName
    this.databaseVersion = databaseVersion
    this.legacyDatabaseNames = legacyDatabaseNames ?? (
      databaseName === REPLICA_DATABASE_NAME
        ? LEGACY_REPLICA_DATABASE_NAMES
        : []
    )
    this.stateKey = stateKey
    this.storeName = storeName
    this.api = api
    /** @type {IDBDatabase | null} */
    this.database = null
    /** @type {Replica} */
    this.replica = emptyReplica()
    /** @type {Promise<void>} */
    this.localWrites = Promise.resolve()
    /** @type {AbortController | null} */
    this.controller = null
  }

  async load() {
    if (this.indexedDb) {
      const opened = await openDatabase(
        this.indexedDb,
        this.databaseName,
        this.databaseVersion,
        this.storeName
      )
      this.database = opened.database
      let state = parseReplica(
        await readState(this.database, this.storeName, this.stateKey)
      )
      if (!state) state = await this.#readLegacyState()
      if (state) {
        this.replica = state
        await writeState(this.database, this.storeName, this.stateKey, state)
      } else {
        this.replica = emptyReplica()
      }
    }
    return structuredClone(this.replica)
  }

  /** @returns {Promise<Replica | null>} */
  async #readLegacyState() {
    if (!this.indexedDb) return null
    for (const databaseName of this.legacyDatabaseNames) {
      if (databaseName === this.databaseName) continue
      const opened = await openDatabase(
        this.indexedDb,
        databaseName,
        this.databaseVersion,
        this.storeName
      )
      const state = parseReplica(
        await readState(opened.database, this.storeName, this.stateKey)
      )
      opened.database.close()
      if (state) return state
      if (opened.created) await deleteDatabase(this.indexedDb, databaseName)
    }
    return null
  }

  /** @param {(replica: Replica) => Replica} update */
  #queueLocalWrite(update) {
    const operation = this.localWrites.then(async () => {
      this.replica = update(this.replica)
      if (this.database) {
        await writeState(
          this.database,
          this.storeName,
          this.stateKey,
          this.replica
        )
      }
    })
    this.localWrites = operation.catch(() => {})
    return operation
  }

  /** @param {Transaction} transaction */
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

  /** @param {TodoStorageSyncInput} input */
  async sync({ basis, pendingTransactions }) {
    await this.localWrites
    this.controller?.abort()
    this.controller = new AbortController()

    const response = this.replica.hasReplica
      ? await this.api.syncTodoLists({
          basis,
          transactions: pendingTransactions.slice(0, SYNC_TRANSACTION_LIMIT),
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

/** @param {IndexedDbReplicaStorageOptions} [options] */
export const createIndexedDbReplicaStorage = (options) =>
  new IndexedDbReplicaStorage(options)
