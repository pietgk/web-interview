import express from 'express'
import cors from 'cors'
import { constants as HTTP } from 'node:http2'
import { ERROR_CODE, TODO_API_PATH } from '@web-interview/todos/protocol'
import { createTodoListsRouter } from './routes/todoLists.js'

const corsOriginPolicy = (allowedOrigins) => (origin, callback) => {
  const allowed =
    !origin ||
    allowedOrigins.includes('*') ||
    allowedOrigins.includes(origin)
  callback(null, allowed)
}

export const createApp = (todoActor, { corsOrigins = [] } = {}) => {
  if (!todoActor) throw new Error('createApp requires the server todo-list actor')
  const app = express()

  app.use(cors({ origin: corsOriginPolicy(corsOrigins) }))
  app.use(express.json())

  app.get('/', (_req, res) => res.send('Hi'))
  app.use(TODO_API_PATH.ROOT, createTodoListsRouter(todoActor))

  // Four-argument signature is required for Express error middleware.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(HTTP.HTTP_STATUS_BAD_REQUEST).json({
        error: 'Malformed JSON',
        code: ERROR_CODE.MALFORMED_JSON,
      })
    }

    console.error(err)
    return res.status(HTTP.HTTP_STATUS_INTERNAL_SERVER_ERROR).json({
      error: 'Internal server error',
      code: ERROR_CODE.INTERNAL,
    })
  })

  return app
}
