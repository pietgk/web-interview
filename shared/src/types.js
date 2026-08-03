/** @typedef {'list/title' | 'list/order' | 'list/deleted' | 'todo/list' | 'todo/text' | 'todo/completed' | 'todo/dueDate' | 'todo/order' | 'todo/deleted'} Attribute */

/** @typedef {string | number | boolean} FactValue */

/** @typedef {[entity: string, attribute: Attribute, value: FactValue, transactionId: string, added: boolean]} Datom */

/**
 * @typedef {object} Todo
 * @property {string} id
 * @property {string} text
 * @property {boolean} completed
 * @property {string | null} dueDate
 */

/**
 * @typedef {object} TodoList
 * @property {string} id
 * @property {string} title
 * @property {Todo[]} todos
 */

/** @typedef {Record<string, TodoList>} TodoLists */

/**
 * @typedef {object} TransactionOrigin
 * @property {string} clientId
 * @property {string} cause
 * @property {string} [listId]
 * @property {string} [userId]
 * @property {string} [undoOf]
 */

/**
 * @typedef {object} Transaction
 * @property {1} version
 * @property {string} id
 * @property {number} basis
 * @property {number} [serverSeq]
 * @property {string} occurredAt
 * @property {string} [serverAt]
 * @property {TransactionOrigin} origin
 * @property {Datom[]} datoms
 */

/** @typedef {Map<string, Map<Attribute, FactValue>>} Facts */

/**
 * @typedef {object} TodoDatabase
 * @property {number} basis
 * @property {Facts} facts
 * @property {Set<string>} transactionIds
 */

/**
 * @typedef {object} RejectedTransaction
 * @property {string} id
 * @property {string} [listId]
 * @property {string} error
 * @property {string} code
 * @property {unknown[]} [issues]
 */

/** @typedef {'error' | 'idle' | 'loading' | 'ready'} ActorStatus */
/** @typedef {'failed' | 'idle' | 'writing'} PersistenceStatus */
/** @typedef {'disabled' | 'failed' | 'idle' | 'offline' | 'syncing'} SyncStatus */

/** @typedef {'error' | 'info' | 'success' | 'warning'} StatusBarSeverity */
/** @typedef {{id: string, text: string}} StatusBarPart */
/** @typedef {{label: string, event: 'RELOAD' | 'RETRY_PERSISTENCE' | 'RETRY_SYNC' | 'REVIEW_REJECTION'}} StatusBarAction */
/** @typedef {{reason: string, rejectionId?: string, listId?: string | null, issues?: unknown[], rolledBack?: boolean}} StatusBarDetails */
/**
 * @typedef {object} StatusBarModel
 * @property {StatusBarSeverity} severity
 * @property {StatusBarPart[]} parts
 * @property {StatusBarAction | null} action
 * @property {StatusBarDetails | null} details
 * @property {boolean} dismissible
 */

/**
 * @typedef {object} TodoListSnapshot
 * @property {ActorStatus} status
 * @property {number} basis
 * @property {TodoLists} readModel
 * @property {TodoLists} authoritativeReadModel
 * @property {readonly Transaction[]} pendingTransactions
 * @property {readonly RejectedTransaction[]} rejectedTransactions
 * @property {PersistenceStatus} persistenceStatus
 * @property {SyncStatus} syncStatus
 * @property {string | null} error
 */

/**
 * @typedef {object} TodoStorageLoadResult
 * @property {boolean} hasReplica
 * @property {number} basis
 * @property {TodoLists} authoritativeReadModel
 * @property {Transaction[]} pendingTransactions
 * @property {string[]} [transactionIds]
 */

/**
 * @typedef {object} TodoStorageAppendResult
 * @property {Transaction} transaction
 * @property {boolean} [authoritative]
 * @property {boolean} [duplicate]
 * @property {boolean} [noOp]
 */

/**
 * @typedef {object} TodoStorageSyncInput
 * @property {number} basis
 * @property {Transaction[]} pendingTransactions
 */

/**
 * @typedef {object} TodoStorageSyncResult
 * @property {number} basis
 * @property {TodoLists} authoritativeReadModel
 * @property {string[]} acceptedTransactionIds
 * @property {RejectedTransaction[]} rejectedTransactions
 */

/**
 * @typedef {object} TodoStorage
 * @property {boolean} [authoritative]
 * @property {() => Promise<TodoStorageLoadResult>} load
 * @property {(transaction: Transaction) => Promise<TodoStorageAppendResult>} append
 * @property {(input: TodoStorageSyncInput) => Promise<TodoStorageSyncResult>} [sync]
 * @property {() => void | Promise<void>} [close]
 */

/**
 * @typedef {object} TransactionResult
 * @property {Transaction} transaction
 * @property {number} basis
 * @property {boolean} [duplicate]
 * @property {boolean} [noOp]
 */

export {}
