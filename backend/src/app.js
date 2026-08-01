import express from 'express'
import cors from 'cors'
import { constants as HTTP } from 'node:http2'
import { createStore } from './store.js'
import { createTodoListsRouter } from './routes/todoLists.js'

export const createApp = (store = createStore()) => {
  const app = express()

  app.use(cors())
  app.use(express.json())

  app.get('/', (_req, res) => res.send('Hi'))
  app.use('/api/todo-lists', createTodoListsRouter(store))

  // Four-argument signature is required for Express error middleware.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(HTTP.HTTP_STATUS_BAD_REQUEST).json({
        error: 'Malformed JSON',
        code: 'MALFORMED_JSON',
      })
    }

    console.error(err)
    return res.status(HTTP.HTTP_STATUS_INTERNAL_SERVER_ERROR).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    })
  })

  return app
}
