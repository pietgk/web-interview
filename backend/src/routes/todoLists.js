import { Router } from 'express'

export const createTodoListsRouter = (store) => {
  const router = Router()

  router.get('/', (_req, res) => {
    res.json(store.getAll())
  })

  router.put('/:id', (req, res) => {
    const { todos } = req.body ?? {}
    const result = store.updateTodos(req.params.id, todos)

    if (!result.ok) {
      return res.status(result.status).json({ error: result.error })
    }

    return res.json(result.list)
  })

  return router
}
