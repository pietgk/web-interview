import { Router } from 'express'
import { constants as HTTP } from 'node:http2'
import { formatZodIssues } from '@web-interview/todos/contract'
import { syncTodoListsRequestSchema } from '@web-interview/todos/database'
import { ERROR_CODE } from '@web-interview/todos/protocol'

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

  return router
}
