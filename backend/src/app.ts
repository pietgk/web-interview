import express from 'express'
import cors from 'cors'
import type { CorsOptions } from 'cors'
import type { ErrorRequestHandler } from 'express'
import { constants as HTTP } from 'node:http2'
import { API_ERROR_CODE, DATOM_API_PATH } from '@web-interview/todos/protocol'
import { createDatomsRouter } from './routes/datoms.ts'
import type { DatomService } from './todos/datomService.ts'

const corsOriginPolicy = (allowedOrigins: string[]): CorsOptions['origin'] =>
  (origin, callback) => {
    const allowed =
      !origin ||
      allowedOrigins.includes('*') ||
      allowedOrigins.includes(origin)
    callback(null, allowed)
  }

export const createApp = (
  datomService: DatomService,
  { corsOrigins = [], heartbeatMs }: { corsOrigins?: string[], heartbeatMs?: number | undefined } = {}
) => {
  if (!datomService) throw new Error('createApp requires the datom service')
  const app = express()

  app.use(cors({ origin: corsOriginPolicy(corsOrigins) }))
  app.use(express.json())

  app.get('/', (_req, res) => res.send('Hi'))
  app.use(DATOM_API_PATH.ROOT, createDatomsRouter(datomService, { heartbeatMs }))

  // Four-argument signature is required for Express error middleware.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const jsonErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(HTTP.HTTP_STATUS_BAD_REQUEST).json({
        error: 'Malformed JSON',
        code: API_ERROR_CODE.MALFORMED_JSON,
      })
      return
    }

    console.error(err)
    res.status(HTTP.HTTP_STATUS_INTERNAL_SERVER_ERROR).json({
      error: 'Internal server error',
      code: API_ERROR_CODE.INTERNAL_ERROR,
    })
  }

  app.use(jsonErrorHandler)

  return app
}
