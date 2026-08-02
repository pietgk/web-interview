import { Router } from 'express'
import { constants as HTTP } from 'node:http2'
import {
  formatZodIssues,
  parseUpdateTodosRequest,
} from '@web-interview/todos/contract'
import { syncTodoListsRequestSchema } from '@web-interview/todos/database'
import { ERROR_CODE } from '@web-interview/todos/protocol'
import { replaceTodoListTransaction } from '@web-interview/todos/transactions'

/** @typedef {import('@web-interview/todos/actor').TodoListActor} TodoListActor */

/** @param {TodoListActor} actor */
const authoritativeSnapshot = (actor) => actor.getSnapshot()

/** @param {TodoListActor} actor */
const readModelResponse = (actor) => {
  const snapshot = authoritativeSnapshot(actor)
  return {
    basis: snapshot.basis,
    todoLists: snapshot.authoritativeReadModel,
  }
}

/** @param {unknown} error */
const transactionError = (error) => {
  const details = typeof error === 'object' && error !== null
    ? /** @type {Record<string, unknown>} */ (error)
    : {}
  const message = typeof details.message === 'string' && details.message
    ? details.message
    : 'Transaction rejected'
  const code = typeof details.code === 'string' && details.code
    ? details.code
    : ERROR_CODE.TRANSACTION_REJECTED
  return {
    error: message,
    code,
    ...(Array.isArray(details.issues) ? { issues: details.issues } : {}),
  }
}

/** @param {TodoListActor} todoActor */
export const createTodoListsRouter = (todoActor) => {
  const router = Router()

  router.get('/', (_req, res) => {
    res.json(authoritativeSnapshot(todoActor).authoritativeReadModel)
  })

  router.get('/read-model', (_req, res) => {
    res.json(readModelResponse(todoActor))
  })

  router.post('/sync', async (req, res) => {
    const parsed = syncTodoListsRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(HTTP.HTTP_STATUS_BAD_REQUEST).json({
        error: 'Validation failed',
        code: ERROR_CODE.VALIDATION,
        issues: formatZodIssues(parsed.error),
      })
    }

    const acceptedTransactionIds = []
    const rejectedTransactions = []
    for (const transaction of parsed.data.transactions) {
      try {
        await todoActor.transact(transaction)
        acceptedTransactionIds.push(transaction.id)
      } catch (error) {
        rejectedTransactions.push({
          id: transaction.id,
          listId: transaction.origin.listId,
          ...transactionError(error),
        })
      }
    }

    return res.status(HTTP.HTTP_STATUS_OK).json({
      ...readModelResponse(todoActor),
      acceptedTransactionIds,
      rejectedTransactions,
    })
  })

  // Whole-list replacement endpoint. Todos omitted from the request are deleted.
  router.put('/:id', async (req, res) => {
    const parsed = parseUpdateTodosRequest(req.body)
    if (!parsed.ok) {
      return res.status(HTTP.HTTP_STATUS_BAD_REQUEST).json(parsed.body)
    }

    const snapshot = authoritativeSnapshot(todoActor)
    const todoList = snapshot.authoritativeReadModel[req.params.id]
    if (!todoList) {
      return res.status(HTTP.HTTP_STATUS_NOT_FOUND).json({
        error: 'Todo list not found',
        code: ERROR_CODE.TODO_LIST_NOT_FOUND,
      })
    }

    const transaction = replaceTodoListTransaction({
      basis: snapshot.basis,
      clientId: req.get('x-client-id') || 'http-compatibility-client',
      todoList,
      todos: parsed.data.todos,
    })

    try {
      if (transaction) await todoActor.transact(transaction)
      return res
        .status(HTTP.HTTP_STATUS_OK)
        .json(authoritativeSnapshot(todoActor).authoritativeReadModel[req.params.id])
    } catch (error) {
      return res
        .status(HTTP.HTTP_STATUS_BAD_REQUEST)
        .json(transactionError(error))
    }
  })

  return router
}
