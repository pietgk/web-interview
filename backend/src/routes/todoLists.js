import { Router } from 'express'
import { constants as HTTP } from 'node:http2'
import {
  formatZodIssues,
  parseUpdateTodosRequest,
  replaceTodoListTransaction,
  syncTodoListsRequestSchema,
} from '@web-interview/todo-contract'

const authoritativeSnapshot = (actor) => actor.getSnapshot()

const readModelResponse = (actor) => {
  const snapshot = authoritativeSnapshot(actor)
  return {
    basis: snapshot.basis,
    todoLists: snapshot.authoritativeReadModel,
  }
}

const transactionError = (error) => ({
  error: error?.message || 'Transaction rejected',
  code: error?.code || 'TRANSACTION_REJECTED',
  ...(error?.issues ? { issues: error.issues } : {}),
})

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
        code: 'VALIDATION_ERROR',
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

  // Compatibility endpoint for the original whole-list client and e2e reset helper.
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
        code: 'TODO_LIST_NOT_FOUND',
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
