export const TODO_TEXT_MAX_LENGTH = 1000
export const SYNC_TRANSACTION_LIMIT = 100
export const TRANSACTION_VERSION = 1

export const TODO_API_PATH = Object.freeze({
  ROOT: '/api/todo-lists',
  READ_MODEL: '/api/todo-lists/read-model',
  SYNC: '/api/todo-lists/sync',
})

export const todoListPath = (listId) =>
  `${TODO_API_PATH.ROOT}/${encodeURIComponent(listId)}`

export const ERROR_CODE = Object.freeze({
  INTERNAL: 'INTERNAL_ERROR',
  INVALID_ERROR_RESPONSE: 'INVALID_ERROR_RESPONSE',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  INVALID_TRANSACTION: 'INVALID_TRANSACTION',
  MALFORMED_JSON: 'MALFORMED_JSON',
  NETWORK: 'NETWORK_ERROR',
  TODO_LIST_NOT_FOUND: 'TODO_LIST_NOT_FOUND',
  TRANSACTION_REJECTED: 'TRANSACTION_REJECTED',
  VALIDATION: 'VALIDATION_ERROR',
})

export const ACTOR_EVENT = Object.freeze({
  OFFLINE: 'OFFLINE',
  ONLINE: 'ONLINE',
  RELOAD: 'RELOAD',
  RETRY_PERSISTENCE: 'RETRY_PERSISTENCE',
  RETRY_SYNC: 'RETRY_SYNC',
  SYNC: 'SYNC',
  TRANSACT: 'TRANSACT',
})

export const ACTOR_STATUS = Object.freeze({
  ERROR: 'error',
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
})

export const PERSISTENCE_STATUS = Object.freeze({
  FAILED: 'failed',
  IDLE: 'idle',
  WRITING: 'writing',
})

export const SYNC_STATUS = Object.freeze({
  DISABLED: 'disabled',
  FAILED: 'failed',
  IDLE: 'idle',
  OFFLINE: 'offline',
  SYNCING: 'syncing',
})

export const TRANSACTION_CAUSE = Object.freeze({
  DATABASE_SEEDED: 'database.seeded',
  TODO_CHANGED: 'todo.changed',
  TODO_CREATED: 'todo.created',
  TODO_DELETED: 'todo.deleted',
  TODO_LIST_REPLACED: 'todo-list.replaced',
})

export const GENESIS_TRANSACTION_ID = 'tx-genesis'
export const SEED_CLIENT_ID = 'server-seed'
