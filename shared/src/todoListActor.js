import {
  applyTransaction,
  databaseFromReadModel,
  projectTodoLists,
} from './todoDatabase.js'

export const SYNC_DEBOUNCE_MS = 400

const emptyTodoLists = () => ({})

const errorMessage = (error, fallback) =>
  error instanceof Error && error.message ? error.message : fallback

const transactionTouchesList = (transaction, listId) =>
  transaction.origin.listId === listId

export class TodoListActor {
  constructor({ storage, clock = globalThis, syncDebounceMs = SYNC_DEBOUNCE_MS }) {
    if (!storage) throw new Error('TodoListActor requires a storage backend')
    this.storage = storage
    this.clock = clock
    this.syncDebounceMs = syncDebounceMs
    this.listeners = new Set()
    this.waiters = new Map()
    this.volatile = []
    this.pending = []
    this.rejected = []
    this.knownTransactionIds = new Set()
    this.authoritativeDatabase = databaseFromReadModel(emptyTodoLists())
    this.optimisticDatabase = this.authoritativeDatabase
    this.writeRunning = false
    this.syncRunning = false
    this.syncTimer = null
    this.retryAttempt = 0
    this.flushRequested = false
    this.online = true
    this.started = false
    this.stopped = false
    this.startPromise = null
    this.snapshot = this.#createSnapshot({ status: 'idle' })
  }

  #createSnapshot(overrides = {}) {
    const readModel = projectTodoLists(this.optimisticDatabase)
    const authoritativeReadModel = projectTodoLists(this.authoritativeDatabase)
    return Object.freeze({
      status: 'loading',
      basis: this.authoritativeDatabase.basis,
      readModel,
      authoritativeReadModel,
      pendingTransactions: Object.freeze([
        ...this.pending,
        ...this.volatile.map((entry) => entry.transaction),
      ]),
      rejectedTransactions: Object.freeze([...this.rejected]),
      persistenceStatus: this.writeRunning ? 'writing' : 'idle',
      syncStatus: this.storage.sync ? 'idle' : 'disabled',
      error: null,
      ...overrides,
    })
  }

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

  subscribe = (listener) => {
    this.listeners.add(listener)
    return { unsubscribe: () => this.listeners.delete(listener) }
  }

  start = () => {
    if (this.startPromise) return this.startPromise
    this.started = true
    this.stopped = false
    this.#publish({ status: 'loading', error: null })
    this.startPromise = this.#hydrate()
    return this.startPromise
  }

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
      this.#publish({ status: 'ready', error: null })
      if (this.storage.sync && loaded.hasReplica) this.#scheduleSync(0)
      if (this.pending.length > 0) this.#scheduleSync(this.syncDebounceMs)
      return this.snapshot
    } catch (error) {
      this.#publish({
        status: 'error',
        syncStatus: this.storage.sync ? 'failed' : 'disabled',
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

  send = (event) => {
    switch (event.type) {
      case 'TRANSACT':
        this.#acceptTransaction(event.transaction)
        break
      case 'SYNC':
        this.flushRequested = this.volatile.length > 0 || this.writeRunning
        if (!this.flushRequested) this.#scheduleSync(0)
        break
      case 'RETRY_PERSISTENCE':
        this.#drainPersistence()
        break
      case 'RETRY_SYNC':
        this.retryAttempt = 0
        this.#scheduleSync(0)
        break
      case 'ONLINE':
        this.online = true
        this.retryAttempt = 0
        this.#scheduleSync(0)
        break
      case 'OFFLINE':
        this.online = false
        if (this.syncTimer != null) this.clock.clearTimeout(this.syncTimer)
        this.syncTimer = null
        this.#publish({ syncStatus: this.storage.sync ? 'offline' : 'disabled' })
        break
      case 'RELOAD':
        if (this.snapshot.status === 'error') {
          this.startPromise = null
          this.start()
        }
        break
      default:
        throw new Error(`Unknown TodoListActor event: ${event.type}`)
    }
  }

  transact = (transaction) =>
    new Promise((resolve, reject) => {
      const waiting = this.waiters.get(transaction.id) ?? []
      waiting.push({ resolve, reject })
      this.waiters.set(transaction.id, waiting)
      try {
        this.send({ type: 'TRANSACT', transaction })
      } catch (error) {
        this.#rejectWaiters(transaction.id, error)
      }
    })

  #resolveWaiters(id, value) {
    for (const waiter of this.waiters.get(id) ?? []) waiter.resolve(value)
    this.waiters.delete(id)
  }

  #rejectWaiters(id, error) {
    for (const waiter of this.waiters.get(id) ?? []) waiter.reject(error)
    this.waiters.delete(id)
  }

  #acceptTransaction(transaction) {
    if (this.snapshot.status !== 'ready') {
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
    this.#publish({ persistenceStatus: 'writing', error: null })
    this.#drainPersistence()
  }

  async #drainPersistence() {
    if (this.writeRunning || this.volatile.length === 0 || this.stopped) return
    this.writeRunning = true
    this.#publish({ persistenceStatus: 'writing', error: null })

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
          persistenceStatus: 'failed',
          error: errorMessage(error, 'Failed to persist transaction'),
        })
        this.#rejectWaiters(entry.transaction.id, error)
        return
      }
    }

    this.writeRunning = false
    this.#publish({ persistenceStatus: 'idle', error: null })
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

  #scheduleSync(delay) {
    if (!this.storage.sync || this.stopped || !this.online) return
    if (this.syncTimer != null) this.clock.clearTimeout(this.syncTimer)
    this.syncTimer = this.clock.setTimeout(() => {
      this.syncTimer = null
      this.#syncOnce()
    }, delay)
  }

  async #syncOnce({ initial = false } = {}) {
    if (!this.storage.sync || this.syncRunning || this.stopped || !this.online) return
    this.syncRunning = true
    this.#publish({ syncStatus: 'syncing', error: null })
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
        status: initial ? this.snapshot.status : 'ready',
        syncStatus: 'idle',
        error: rejected.length > 0 ? rejected[0].error : null,
      })
      if (this.pending.length > 0) this.#scheduleSync(this.syncDebounceMs)
    } catch (error) {
      this.syncRunning = false
      this.retryAttempt += 1
      const offline = error?.code === 'NETWORK_ERROR' || this.online === false
      this.#publish({
        syncStatus: offline ? 'offline' : 'failed',
        error: errorMessage(error, 'Failed to synchronize todo lists'),
      })
      if (!initial) {
        const retryDelay = Math.min(30_000, 1000 * 2 ** (this.retryAttempt - 1))
        this.#scheduleSync(retryDelay)
      } else {
        throw error
      }
    }
  }
}

export const createTodoListActor = (options) => new TodoListActor(options)

export const transactionAffectsList = transactionTouchesList
