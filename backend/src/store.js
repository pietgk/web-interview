import { todosSchema, validationErrorBody } from '@web-interview/todo-contract'
import { createSeedTodoLists } from './seed.js'

export const STORE_ERROR = Object.freeze({
  TODO_LIST_NOT_FOUND: 'TODO_LIST_NOT_FOUND',
  INVALID_TODOS: 'INVALID_TODOS',
})

export const createStore = (initialLists = createSeedTodoLists()) => {
  let todoLists = structuredClone(initialLists)

  const getAll = () => structuredClone(todoLists)

  const getById = (id) => {
    const list = todoLists[id]
    return list ? structuredClone(list) : null
  }

  const updateTodos = (id, todos) => {
    if (!todoLists[id]) {
      return {
        ok: false,
        code: STORE_ERROR.TODO_LIST_NOT_FOUND,
      }
    }

    const parsed = todosSchema.safeParse(todos)
    if (!parsed.success) {
      return {
        ok: false,
        code: STORE_ERROR.INVALID_TODOS,
        body: validationErrorBody(parsed.error, 'Invalid todos'),
      }
    }

    todoLists = {
      ...todoLists,
      [id]: {
        ...todoLists[id],
        todos: structuredClone(parsed.data),
      },
    }

    return { ok: true, list: getById(id) }
  }

  return { getAll, getById, updateTodos }
}
