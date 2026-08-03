import {
  applyTransaction,
  databaseFromReadModel,
  projectTodoLists,
} from './todoDatabase.js'
import {
  ACTOR_EVENT,
  ACTOR_STATUS,
  ERROR_CODE,
  PERSISTENCE_STATUS,
  SYNC_STATUS,
} from './todoProtocol.js'

/** @typedef {import('./types.js').ActorStatus} ActorStatus */
/** @typedef {import('./types.js').PersistenceStatus} PersistenceStatus */
/** @typedef {import('./types.js').RejectedTransaction} RejectedTransaction */
/** @typedef {import('./types.js').SyncStatus} SyncStatus */
/** @typedef {import('./types.js').TodoDatabase} TodoDatabase */
/** @typedef {import('./types.js').TodoListSnapshot} TodoListSnapshot */
/** @typedef {import('./types.js').TodoStorage} TodoStorage */
/** @typedef {import('./types.js').Transaction} Transaction */
/** @typedef {import('./types.js').TransactionResult} TransactionResult */
/**
 * @typedef {object} SnapshotOverrides
 * @property {ActorStatus} [status]
 * @property {PersistenceStatus} [persistenceStatus]
 * @property {SyncStatus} [syncStatus]
 * @property {string | null} [error]
 */
/** @typedef {{setTimeout: (callback: () => void, delay: number) => unknown, clearTimeout: (handle: unknown) => void}} ActorClock */
/** @typedef {(snapshot: TodoListSnapshot) => void} SnapshotListener */
/** @typedef {{resolve: (value: TransactionResult) => void, reject: (reason?: unknown) => void}} TransactionWaiter */
/** @typedef {{transaction: Transaction}} VolatileTransaction */
/** @typedef {{type: 'TRANSACT', transaction: Transaction} | {type: 'DISMISS_REJECTION', transactionId: string} | {type: 'SYNC' | 'RETRY_PERSISTENCE' | 'RETRY_SYNC' | 'ONLINE' | 'OFFLINE' | 'RELOAD'}} TodoListActorEvent */
/**
 * @typedef {object} TodoListActorOptions
 * @property {TodoStorage} storage
 * @property {ActorClock} [clock]
 * @property {(attempt: number) => number} [retryDelay]
 * @property {number} [syncDebounceMs]
 */

export const SYNC_DEBOUNCE_MS = 400
const SYNC_RETRY_BASE_MS = 1_000
const SYNC_RETRY_MAX_MS = 30_000
const SYNC_RETRY_JITTER_RATIO = 0.2

/** @param {number} attempt */
export const defaultSyncRetryDelay = (attempt) => {
  const exponentialDelay = Math.min(
    SYNC_RETRY_MAX_MS,
    SYNC_RETRY_BASE_MS * 2 ** (attempt - 1)
  )
  const jitter = 1 - SYNC_RETRY_JITTER_RATIO + Math.random() * 2 * SYNC_RETRY_JITTER_RATIO
  return Math.round(exponentialDelay * jitter)
}

/** @returns {import('./types.js').TodoLists} */
const emptyTodoLists = () => ({})

/**
 * @param {unknown} error
 * @param {string} fallback
 */
const errorMessage = (error, fallback) =>
  error instanceof Error && error.message ? error.message : fallback

/** @param {unknown} error */
const errorCode = (error) => {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null
  }
  return typeof error.code === 'string' ? error.code : null
}

/**
 * @param {Transaction} transaction
 * @param {string} listId
 */
const transactionTouchesList = (transaction, listId) =>
  transaction.origin.listId === listId

export class TodoListActor {
  /** @param {TodoListActorOptions} options */
  constructor({
    storage,
    clock = /** @type {ActorClock} */ (globalThis),
    retryDelay = defaultSyncRetryDelay,
    syncDebounceMs = SYNC_DEBOUNCE_MS,
  }) {
    if (!storage) throw new Error('TodoListActor requires a storage backend')
    this.storage = storage
    this.clock = clock
    this.retryDelay = retryDelay
    this.syncDebounceMs = syncDebounceMs
    /** @type {Set<SnapshotListener>} */
    this.listeners = new Set()
    /** @type {Map<string, TransactionWaiter[]>} */
    this.waiters = new Map()
    /** @type {VolatileTransaction[]} */
    this.volatile = []
    /** @type {Transaction[]} */
    this.pending = []
    /** @type {RejectedTransaction[]} */
    this.rejected = []
    /** @type {Set<string>} */
    this.knownTransactionIds = new Set()
    /** @type {TodoDatabase} */
    this.authoritativeDatabase = databaseFromReadModel(emptyTodoLists())
    /** @type {TodoDatabase} */
    this.optimisticDatabase = this.authoritativeDatabase
    this.writeRunning = false
    this.syncRunning = false
    /** @type {unknown | null} */
    this.syncTimer = null
    this.retryAttempt = 0
    this.flushRequested = false
    this.online = true
    this.started = false
    this.stopped = false
    /** @type {Promise<TodoListSnapshot> | null} */
    this.startPromise = null
    /** @type {TodoListSnapshot} */
    this.snapshot = this.#createSnapshot({ status: ACTOR_STATUS.IDLE })
  }

  /**
   * @param {SnapshotOverrides} overrides
   * @returns {TodoListSnapshot}
   */
  #createSnapshot(overrides = {}) {
    const readModel = projectTodoLists(this.optimisticDatabase)
    const authoritativeReadModel = projectTodoLists(this.authoritativeDatabase)
    return Object.freeze({
      status: ACTOR_STATUS.LOADING,
      basis: this.authoritativeDatabase.basis,
      readModel,
      authoritativeReadModel,
      pendingTransactions: Object.freeze([
        ...this.pending,
        ...this.volatile.map((entry) => entry.transaction),
      ]),
      rejectedTransactions: Object.freeze([...this.rejected]),
      persistenceStatus: this.writeRunning
        ? PERSISTENCE_STATUS.WRITING
        : PERSISTENCE_STATUS.IDLE,
      syncStatus: this.storage.sync ? SYNC_STATUS.IDLE : SYNC_STATUS.DISABLED,
      error: null,
      ...overrides,
    })
  }

  /** @param {SnapshotOverrides} overrides */
  #publish(overrides = {}) {
    this.snapshot = this.#createSnapshot({
      status: this.snapshot.status,
      persistenceStatus: this.snapshot.persistenceStatus,
      syncStatus: this.snapshot.syncStatus,
      error: this.snapshot.error,
      ...overrides,
    })
    for (const listener of this.listeners) listener(this.snapshot)
  }

  getSnapshot = () => this.snapshot

  /** @param {SnapshotListener} listener */
  subscribe = (listener) => {
    this.listeners.add(listener)
    return {
      unsubscribe: () => {
        this.listeners.delete(listener)
      },
    }
  }

  /** @returns {Promise<TodoListSnapshot>} */
  start = () => {
    if (this.startPromise) return this.startPromise
    this.started = true
    this.stopped = false
    this.#publish({ status: ACTOR_STATUS.LOADING, error: null })
    this.startPromise = this.#hydrate()
    return this.startPromise
  }

  /** @returns {Promise<TodoListSnapshot>} */
  async #hydrate() {
    try {
      const loaded = await this.storage.load()
      this.authoritativeDatabase = databaseFromReadModel(
        loaded.authoritativeReadModel ?? emptyTodoLists(),
        loaded.basis ?? 0
      )
      this.knownTransactionIds = new Set(loaded.transactionIds ?? [])
      this.pending = [...(loaded.pendingTransactions ?? [])]
      this.pending.forEach((transaction) =>
        this.knownTransactionIds.add(transaction.id)
      )
      this.#rebuildOptimistic()

      if (this.storage.sync && !loaded.hasReplica) {
        await this.#syncOnce({ initial: true })
      }

      if (this.stopped) return this.snapshot
      this.#publish({ status: ACTOR_STATUS.READY, error: null })
      if (this.storage.sync && loaded.hasReplica) this.#scheduleSync(0)
      if (this.pending.length > 0) this.#scheduleSync(this.syncDebounceMs)
      return this.snapshot
    } catch (error) {
      this.#publish({
        status: ACTOR_STATUS.ERROR,
        syncStatus: this.storage.sync ? SYNC_STATUS.FAILED : SYNC_STATUS.DISABLED,
        error: errorMessage(error, 'Failed to load todo lists'),
      })
      return this.snapshot
    }
  }

  stop = async () => {
    this.stopped = true
    this.started = false
    if (this.syncTimer != null) this.clock.clearTimeout(this.syncTimer)
    this.syncTimer = null
    await this.storage.close?.()
    this.listeners.clear()
  }

  /** @param {TodoListActorEvent} event */
  send = (event) => {
    switch (event.type) {
      case ACTOR_EVENT.TRANSACT:
        this.#acceptTransaction(event.transaction)
        break
      case ACTOR_EVENT.DISMISS_REJECTION:
        this.rejected = this.rejected.filter(
          (entry) => entry.id !== event.transactionId
        )
        this.#publish()
        break
      case ACTOR_EVENT.SYNC:
        this.flushRequested = this.volatile.length > 0 || this.writeRunning
        if (!this.flushRequested) this.#scheduleSync(0)
        break
      case ACTOR_EVENT.RETRY_PERSISTENCE:
        this.#drainPersistence()
        break
      case ACTOR_EVENT.RETRY_SYNC:
        this.retryAttempt = 0
        this.#scheduleSync(0)
        break
      case ACTOR_EVENT.ONLINE:
        this.online = true
        this.retryAttempt = 0
        this.#scheduleSync(0)
        break
      case ACTOR_EVENT.OFFLINE:
        this.online = false
        if (this.syncTimer != null) this.clock.clearTimeout(this.syncTimer)
        this.syncTimer = null
        this.#publish({
          syncStatus: this.storage.sync ? SYNC_STATUS.OFFLINE : SYNC_STATUS.DISABLED,
        })
        break
      case ACTOR_EVENT.RELOAD:
        if (this.snapshot.status === ACTOR_STATUS.ERROR) {
          this.startPromise = null
          this.start()
        }
        break
      default:
        throw new Error('Unknown TodoListActor event')
    }
  }

  /**
   * @param {Transaction} transaction
   * @returns {Promise<TransactionResult>}
   */
  transact = (transaction) =>
    new Promise((resolve, reject) => {
      const waiting = this.waiters.get(transaction.id) ?? []
      waiting.push({ resolve, reject: (reason) => reject(reason) })
      this.waiters.set(transaction.id, waiting)
      try {
        this.send({ type: ACTOR_EVENT.TRANSACT, transaction })
      } catch (error) {
        this.#rejectWaiters(transaction.id, error)
      }
    })

  /**
   * @param {string} id
   * @param {TransactionResult} value
   */
  #resolveWaiters(id, value) {
    for (const waiter of this.waiters.get(id) ?? []) waiter.resolve(value)
    this.waiters.delete(id)
  }

  /**
   * @param {string} id
   * @param {unknown} error
   */
  #rejectWaiters(id, error) {
    for (const waiter of this.waiters.get(id) ?? []) waiter.reject(error)
    this.waiters.delete(id)
  }

  /** @param {Transaction} transaction */
  #acceptTransaction(transaction) {
    if (this.snapshot.status !== ACTOR_STATUS.READY) {
      throw new Error('TodoListActor is not ready')
    }

    if (
      this.knownTransactionIds.has(transaction.id) ||
      this.volatile.some((entry) => entry.transaction.id === transaction.id)
    ) {
      this.#resolveWaiters(transaction.id, {
        transaction,
        duplicate: true,
        basis: this.authoritativeDatabase.basis,
      })
      return
    }

    const applied = applyTransaction(this.optimisticDatabase, transaction)
    if (applied.noOp) {
      this.#resolveWaiters(transaction.id, {
        transaction: applied.transaction,
        noOp: true,
        basis: this.authoritativeDatabase.basis,
      })
      return
    }

    this.optimisticDatabase = applied.database
    this.volatile.push({ transaction: applied.transaction })
    this.#publish({ persistenceStatus: PERSISTENCE_STATUS.WRITING, error: null })
    this.#drainPersistence()
  }

  async #drainPersistence() {
    if (this.writeRunning || this.volatile.length === 0 || this.stopped) return
    this.writeRunning = true
    this.#publish({ persistenceStatus: PERSISTENCE_STATUS.WRITING, error: null })

    while (this.volatile.length > 0 && !this.stopped) {
      const entry = this.volatile[0]
      try {
        const result = await this.storage.append(entry.transaction)
        const persisted = result?.transaction ?? entry.transaction
        this.volatile.shift()
        this.knownTransactionIds.add(persisted.id)

        if (result?.authoritative ?? this.storage.authoritative) {
          const applied = applyTransaction(this.authoritativeDatabase, persisted)
          this.authoritativeDatabase = applied.database
        } else {
          this.pending.push(persisted)
        }

        this.#rebuildOptimistic()
        this.#resolveWaiters(entry.transaction.id, {
          transaction: persisted,
          basis: this.authoritativeDatabase.basis,
        })
      } catch (error) {
        this.writeRunning = false
        this.#publish({
          persistenceStatus: PERSISTENCE_STATUS.FAILED,
          error: errorMessage(error, 'Failed to persist transaction'),
        })
        this.#rejectWaiters(entry.transaction.id, error)
        return
      }
    }

    this.writeRunning = false
    this.#publish({ persistenceStatus: PERSISTENCE_STATUS.IDLE, error: null })
    if (this.storage.sync && this.pending.length > 0) {
      const delay = this.flushRequested ? 0 : this.syncDebounceMs
      this.flushRequested = false
      this.#scheduleSync(delay)
    }
  }

  #rebuildOptimistic() {
    let database = this.authoritativeDatabase
    for (const transaction of [
      ...this.pending,
      ...this.volatile.map((entry) => entry.transaction),
    ]) {
      database = applyTransaction(database, transaction).database
    }
    this.optimisticDatabase = database
  }

  /** @param {number} delay */
  #scheduleSync(delay) {
    if (!this.storage.sync || this.stopped || !this.online) return
    if (this.syncTimer != null) this.clock.clearTimeout(this.syncTimer)
    this.syncTimer = this.clock.setTimeout(() => {
      this.syncTimer = null
      this.#syncOnce()
    }, delay)
  }

  /** @param {{initial?: boolean}} [options] */
  async #syncOnce({ initial = false } = {}) {
    if (!this.storage.sync || this.syncRunning || this.stopped || !this.online) return
    this.syncRunning = true
    this.#publish({ syncStatus: SYNC_STATUS.SYNCING, error: null })
    const submitted = [...this.pending]

    try {
      const result = await this.storage.sync({
        basis: this.authoritativeDatabase.basis,
        pendingTransactions: submitted,
      })
      const accepted = new Set(result.acceptedTransactionIds ?? [])
      const rejected = result.rejectedTransactions ?? []
      const rejectedIds = new Set(rejected.map((entry) => entry.id))
      this.pending = this.pending.filter(
        (transaction) => !accepted.has(transaction.id) && !rejectedIds.has(transaction.id)
      )
      this.rejected = [...this.rejected, ...rejected]
      this.authoritativeDatabase = databaseFromReadModel(
        result.authoritativeReadModel,
        result.basis
      )
      this.#rebuildOptimistic()
      this.retryAttempt = 0
      this.syncRunning = false
      this.#publish({
        status: initial ? this.snapshot.status : ACTOR_STATUS.READY,
        syncStatus: SYNC_STATUS.IDLE,
        error: rejected.length > 0 ? rejected[0].error : null,
      })
      if (this.pending.length > 0) this.#scheduleSync(this.syncDebounceMs)
    } catch (error) {
      this.syncRunning = false
      this.retryAttempt += 1
      const offline = errorCode(error) === ERROR_CODE.NETWORK || !this.online
      this.#publish({
        syncStatus: offline ? SYNC_STATUS.OFFLINE : SYNC_STATUS.FAILED,
        error: errorMessage(error, 'Failed to synchronize todo lists'),
      })
      if (!initial) {
        this.#scheduleSync(this.retryDelay(this.retryAttempt))
      } else {
        throw error
      }
    }
  }
}

/** @param {TodoListActorOptions} options */
export const createTodoListActor = (options) => new TodoListActor(options)

export const transactionAffectsList = transactionTouchesList
