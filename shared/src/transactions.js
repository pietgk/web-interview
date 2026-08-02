import { ATTRIBUTE } from './todoDatabase.js'

const fallbackId = () =>
  `tx-${Date.now()}-${Math.random().toString(16).slice(2)}`

const randomId = (prefix) => {
  const cryptoApi = typeof crypto !== 'undefined' ? crypto : undefined
  return `${prefix}-${cryptoApi?.randomUUID?.() ?? fallbackId()}`
}

export const newTodoId = () => randomId('todo')

export const createTransaction = ({
  basis = 0,
  clientId,
  cause,
  listId,
  datoms,
  id = randomId('tx'),
  occurredAt = new Date().toISOString(),
}) => ({
  version: 1,
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
    cause: 'todo.created',
    datoms: [
      [todo.id, ATTRIBUTE.TODO_LIST, listId],
      [todo.id, ATTRIBUTE.TODO_TEXT, todo.text],
      [todo.id, ATTRIBUTE.TODO_COMPLETED, todo.completed],
      ...(todo.dueDate == null
        ? []
        : [[todo.id, ATTRIBUTE.TODO_DUE_DATE, todo.dueDate]]),
      [todo.id, ATTRIBUTE.TODO_ORDER, order],
      [todo.id, ATTRIBUTE.TODO_DELETED, false],
    ],
  })

export const patchTodoTransaction = ({
  basis,
  clientId,
  listId,
  todo,
  patch,
}) => {
  const datoms = []
  if ('text' in patch && patch.text !== todo.text) {
    datoms.push([todo.id, ATTRIBUTE.TODO_TEXT, patch.text])
  }
  if ('completed' in patch && patch.completed !== todo.completed) {
    datoms.push([todo.id, ATTRIBUTE.TODO_COMPLETED, patch.completed])
  }
  if ('dueDate' in patch && patch.dueDate !== todo.dueDate) {
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
    cause: 'todo.changed',
    datoms,
  })
}

export const deleteTodoTransaction = ({ basis, clientId, listId, todo }) =>
  createTransaction({
    basis,
    clientId,
    listId,
    cause: 'todo.deleted',
    datoms: [[todo.id, ATTRIBUTE.TODO_DELETED, true]],
  })

export const seedTransactionFromTodoLists = ({
  todoLists,
  clientId = 'server-seed',
  id = 'tx-genesis',
  occurredAt = '2026-01-01T00:00:00.000Z',
}) => {
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
        [todo.id, ATTRIBUTE.TODO_COMPLETED, todo.completed],
        ...(todo.dueDate == null
          ? []
          : [[todo.id, ATTRIBUTE.TODO_DUE_DATE, todo.dueDate]]),
        [todo.id, ATTRIBUTE.TODO_ORDER, todoOrder],
        [todo.id, ATTRIBUTE.TODO_DELETED, false]
      )
    })
  })
  return createTransaction({
    basis: 0,
    clientId,
    cause: 'database.seeded',
    datoms,
    id,
    occurredAt,
  })
}

export const replaceTodoListTransaction = ({
  basis,
  clientId,
  todoList,
  todos,
}) => {
  const existing = new Map(todoList.todos.map((todo) => [todo.id, todo]))
  const incomingIds = new Set(todos.map((todo) => todo.id))
  const datoms = []

  todos.forEach((todo, order) => {
    const previous = existing.get(todo.id)
    if (!previous) {
      datoms.push(
        [todo.id, ATTRIBUTE.TODO_LIST, todoList.id],
        [todo.id, ATTRIBUTE.TODO_TEXT, todo.text],
        [todo.id, ATTRIBUTE.TODO_COMPLETED, todo.completed],
        ...(todo.dueDate == null
          ? []
          : [[todo.id, ATTRIBUTE.TODO_DUE_DATE, todo.dueDate]]),
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
    cause: 'todo-list.replaced',
    datoms,
  })
}
