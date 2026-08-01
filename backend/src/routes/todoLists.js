import { Router } from 'express'
import { constants as HTTP } from 'node:http2'
import { parseUpdateTodosRequest } from '@web-interview/todo-contract'
import { STORE_ERROR } from '../store.js'

const ERROR_STATUS = {
  [STORE_ERROR.TODO_LIST_NOT_FOUND]: HTTP.HTTP_STATUS_NOT_FOUND,
  [STORE_ERROR.INVALID_TODOS]: HTTP.HTTP_STATUS_BAD_REQUEST,
}

const ERROR_BODY = {
  [STORE_ERROR.TODO_LIST_NOT_FOUND]: {
    error: 'Todo list not found',
    code: STORE_ERROR.TODO_LIST_NOT_FOUND,
  },
}

export const createTodoListsRouter = (store) => {
  const router = Router()

  router.get('/', (_req, res) => {
    res.json(store.getAll())
  })

  router.put('/:id', (req, res) => {
    const parsed = parseUpdateTodosRequest(req.body)
    if (!parsed.ok) {
      return res.status(HTTP.HTTP_STATUS_BAD_REQUEST).json(parsed.body)
    }

    const result = store.updateTodos(req.params.id, parsed.data.todos)

    if (!result.ok) {
      const status =
        ERROR_STATUS[result.code] ?? HTTP.HTTP_STATUS_INTERNAL_SERVER_ERROR
      const body = result.body ?? ERROR_BODY[result.code] ?? {
        error: 'Unexpected store error',
        code: result.code,
      }
      return res.status(status).json(body)
    }

    return res.status(HTTP.HTTP_STATUS_OK).json(result.list)
  })

  return router
}
