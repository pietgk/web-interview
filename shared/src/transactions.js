import { ATTRIBUTE } from './todoDatabase.js'
import {
  GENESIS_TRANSACTION_ID,
  SEED_CLIENT_ID,
  TRANSACTION_CAUSE,
  TRANSACTION_VERSION,
} from './todoProtocol.js'

/** @typedef {import('./types.js').Attribute} Attribute */
/** @typedef {import('./types.js').FactValue} FactValue */
/** @typedef {import('./types.js').Todo} Todo */
/** @typedef {import('./types.js').TodoList} TodoList */
/** @typedef {import('./types.js').TodoLists} TodoLists */
/** @typedef {import('./types.js').Transaction} Transaction */
/** @typedef {[entity: string, attribute: Attribute, value: FactValue, added?: boolean]} DatomInput */

/**
 * @typedef {object} TransactionOptions
 * @property {number} [basis]
 * @property {string} clientId
 * @property {string} cause
 * @property {string} [listId]
 * @property {DatomInput[]} datoms
 * @property {string} [id]
 * @property {string} [occurredAt]
 */

/**
 * @typedef {object} TodoTransactionOptions
 * @property {number} basis
 * @property {string} clientId
 * @property {string} listId
 * @property {Todo} todo
 * @property {number} [order]
 */

/**
 * @typedef {object} PatchTodoTransactionOptions
 * @property {number} basis
 * @property {string} clientId
 * @property {string} listId
 * @property {Todo} todo
 * @property {Partial<Pick<Todo, 'text' | 'completed' | 'dueDate'>>} patch
 */

/**
 * @typedef {object} SeedTransactionOptions
 * @property {TodoLists} todoLists
 * @property {string} [clientId]
 * @property {string} [id]
 * @property {string} [occurredAt]
 */

/**
 * @typedef {object} ReplaceTodoListTransactionOptions
 * @property {number} basis
 * @property {string} clientId
 * @property {TodoList} todoList
 * @property {Todo[]} todos
 */

/** @returns {string} */
const fallbackId = () =>
  `tx-${Date.now()}-${Math.random().toString(16).slice(2)}`

/**
 * @param {string} prefix
 * @returns {string}
 */
const randomId = (prefix) => {
  const cryptoApi = typeof crypto !== 'undefined' ? crypto : undefined
  return `${prefix}-${cryptoApi?.randomUUID?.() ?? fallbackId()}`
}

export const newTodoId = () => randomId('todo')

/**
 * @param {TransactionOptions} options
 * @returns {Transaction}
 */
export const createTransaction = ({
  basis = 0,
  clientId,
  cause,
  listId,
  datoms,
  id = randomId('tx'),
  occurredAt = new Date().toISOString(),
}) => ({
  version: TRANSACTION_VERSION,
  id,
  basis,
  occurredAt,
  origin: {
    clientId,
    cause,
    ...(listId ? { listId } : {}),
  },
  datoms: datoms.map(([entity, attribute, value, added = true]) => [
    entity,
    attribute,
    value,
    id,
    added,
  ]),
})

/**
 * @param {TodoTransactionOptions} options
 * @returns {Transaction}
 */
export const createTodoTransaction = ({
  basis,
  clientId,
  listId,
  todo,
  order = 0,
}) =>
  createTransaction({
    basis,
    clientId,
    listId,
    cause: TRANSACTION_CAUSE.TODO_CREATED,
    datoms: /** @type {DatomInput[]} */ ([
      [todo.id, ATTRIBUTE.TODO_LIST, listId],
      [todo.id, ATTRIBUTE.TODO_TEXT, todo.text],
      [todo.id, ATTRIBUTE.TODO_COMPLETED, todo.completed],
      ...(todo.dueDate == null
        ? []
        : [[todo.id, ATTRIBUTE.TODO_DUE_DATE, todo.dueDate]]),
      [todo.id, ATTRIBUTE.TODO_ORDER, order],
      [todo.id, ATTRIBUTE.TODO_DELETED, false],
    ]),
  })

/**
 * @param {TodoTransactionOptions & {now?: () => number}} options
 * @returns {Transaction}
 */
export const createTodoAtTopTransaction = ({ now = Date.now, ...input }) =>
  createTodoTransaction({
    ...input,
    order: -now(),
  })

/**
 * @param {PatchTodoTransactionOptions} options
 * @returns {Transaction | null}
 */
export const patchTodoTransaction = ({
  basis,
  clientId,
  listId,
  todo,
  patch,
}) => {
  /** @type {DatomInput[]} */
  const datoms = []
  if ('text' in patch && patch.text !== undefined && patch.text !== todo.text) {
    datoms.push([todo.id, ATTRIBUTE.TODO_TEXT, patch.text])
  }
  if (
    'completed' in patch &&
    patch.completed !== undefined &&
    patch.completed !== todo.completed
  ) {
    datoms.push([todo.id, ATTRIBUTE.TODO_COMPLETED, patch.completed])
  }
  if (
    'dueDate' in patch &&
    patch.dueDate !== undefined &&
    patch.dueDate !== todo.dueDate
  ) {
    if (patch.dueDate == null) {
      if (todo.dueDate != null) {
        datoms.push([todo.id, ATTRIBUTE.TODO_DUE_DATE, todo.dueDate, false])
      }
    } else {
      datoms.push([todo.id, ATTRIBUTE.TODO_DUE_DATE, patch.dueDate])
    }
  }

  if (datoms.length === 0) return null
  return createTransaction({
    basis,
    clientId,
    listId,
    cause: TRANSACTION_CAUSE.TODO_CHANGED,
    datoms,
  })
}

/**
 * @param {Omit<TodoTransactionOptions, 'order'>} options
 * @returns {Transaction}
 */
export const deleteTodoTransaction = ({ basis, clientId, listId, todo }) =>
  createTransaction({
    basis,
    clientId,
    listId,
    cause: TRANSACTION_CAUSE.TODO_DELETED,
    datoms: [[todo.id, ATTRIBUTE.TODO_DELETED, true]],
  })

/**
 * @param {SeedTransactionOptions} options
 * @returns {Transaction}
 */
export const seedTransactionFromTodoLists = ({
  todoLists,
  clientId = SEED_CLIENT_ID,
  id = GENESIS_TRANSACTION_ID,
  occurredAt = new Date().toISOString(),
}) => {
  /** @type {DatomInput[]} */
  const datoms = []
  Object.values(todoLists).forEach((list, listOrder) => {
    datoms.push(
      [list.id, ATTRIBUTE.LIST_TITLE, list.title],
      [list.id, ATTRIBUTE.LIST_ORDER, listOrder]
    )
    list.todos.forEach((todo, todoOrder) => {
      datoms.push(
        [todo.id, ATTRIBUTE.TODO_LIST, list.id],
        [todo.id, ATTRIBUTE.TODO_TEXT, todo.text],
        [todo.id, ATTRIBUTE.TODO_COMPLETED, todo.completed]
      )
      if (todo.dueDate != null) {
        datoms.push([todo.id, ATTRIBUTE.TODO_DUE_DATE, todo.dueDate])
      }
      datoms.push(
        [todo.id, ATTRIBUTE.TODO_ORDER, todoOrder],
        [todo.id, ATTRIBUTE.TODO_DELETED, false]
      )
    })
  })
  return createTransaction({
    basis: 0,
    clientId,
    cause: TRANSACTION_CAUSE.DATABASE_SEEDED,
    datoms,
    id,
    occurredAt,
  })
}

/**
 * @param {ReplaceTodoListTransactionOptions} options
 * @returns {Transaction | null}
 */
export const replaceTodoListTransaction = ({
  basis,
  clientId,
  todoList,
  todos,
}) => {
  const existing = new Map(todoList.todos.map((todo) => [todo.id, todo]))
  const incomingIds = new Set(todos.map((todo) => todo.id))
  /** @type {DatomInput[]} */
  const datoms = []

  todos.forEach((todo, order) => {
    const previous = existing.get(todo.id)
    if (!previous) {
      datoms.push(
        [todo.id, ATTRIBUTE.TODO_LIST, todoList.id],
        [todo.id, ATTRIBUTE.TODO_TEXT, todo.text],
        [todo.id, ATTRIBUTE.TODO_COMPLETED, todo.completed]
      )
      if (todo.dueDate != null) {
        datoms.push([todo.id, ATTRIBUTE.TODO_DUE_DATE, todo.dueDate])
      }
      datoms.push(
        [todo.id, ATTRIBUTE.TODO_ORDER, order],
        [todo.id, ATTRIBUTE.TODO_DELETED, false]
      )
      return
    }

    if (previous.text !== todo.text) {
      datoms.push([todo.id, ATTRIBUTE.TODO_TEXT, todo.text])
    }
    if (previous.completed !== todo.completed) {
      datoms.push([todo.id, ATTRIBUTE.TODO_COMPLETED, todo.completed])
    }
    if (previous.dueDate !== todo.dueDate) {
      if (todo.dueDate == null && previous.dueDate != null) {
        datoms.push([todo.id, ATTRIBUTE.TODO_DUE_DATE, previous.dueDate, false])
      } else if (todo.dueDate != null) {
        datoms.push([todo.id, ATTRIBUTE.TODO_DUE_DATE, todo.dueDate])
      }
    }
    datoms.push([todo.id, ATTRIBUTE.TODO_ORDER, order])
  })

  for (const todo of todoList.todos) {
    if (!incomingIds.has(todo.id)) {
      datoms.push([todo.id, ATTRIBUTE.TODO_DELETED, true])
    }
  }

  if (datoms.length === 0) return null
  return createTransaction({
    basis,
    clientId,
    listId: todoList.id,
    cause: TRANSACTION_CAUSE.TODO_LIST_REPLACED,
    datoms,
  })
}
