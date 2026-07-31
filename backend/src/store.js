import { createSeedTodoLists } from './seed.js'

const isValidTodo = (todo) =>
  todo !== null &&
  typeof todo === 'object' &&
  typeof todo.id === 'string' &&
  typeof todo.text === 'string' &&
  typeof todo.completed === 'boolean' &&
  (todo.dueDate === null || typeof todo.dueDate === 'string')

export const createStore = (initialLists = createSeedTodoLists()) => {
  let todoLists = structuredClone(initialLists)

  const getAll = () => structuredClone(todoLists)

  const getById = (id) => {
    const list = todoLists[id]
    return list ? structuredClone(list) : null
  }

  const updateTodos = (id, todos) => {
    if (!todoLists[id]) {
      return { ok: false, error: 'Todo list not found', status: 404 }
    }
    if (!Array.isArray(todos)) {
      return { ok: false, error: 'todos must be an array', status: 400 }
    }
    if (!todos.every(isValidTodo)) {
      return {
        ok: false,
        error: 'each todo must have id, text, completed, and dueDate',
        status: 400,
      }
    }

    todoLists = {
      ...todoLists,
      [id]: {
        ...todoLists[id],
        todos: structuredClone(todos),
      },
    }

    return { ok: true, list: getById(id) }
  }

  const reset = (lists = createSeedTodoLists()) => {
    todoLists = structuredClone(lists)
  }

  return { getAll, getById, updateTodos, reset }
}
