import express from 'express'
import cors from 'cors'
import { constants as HTTP } from 'node:http2'
import { API_ERROR_CODE, DATOM_API_PATH } from '@web-interview/todos/protocol'
import { createDatomsRouter } from './routes/datoms.js'

/** @typedef {Awaited<ReturnType<typeof import('./todos/datomService.js').createDatomService>>} DatomService */

/**
 * @param {string[]} allowedOrigins
 * @returns {import('cors').CorsOptions['origin']}
 */
const corsOriginPolicy = (allowedOrigins) =>
  (origin, callback) => {
    const allowed =
      !origin ||
      allowedOrigins.includes('*') ||
      allowedOrigins.includes(origin)
    callback(null, allowed)
  }

/**
 * @param {DatomService} datomService
 * @param {{corsOrigins?: string[], heartbeatMs?: number}} [options]
 */
export const createApp = (datomService, { corsOrigins = [], heartbeatMs } = {}) => {
  if (!datomService) throw new Error('createApp requires the datom service')
  const app = express()

  app.use(cors({ origin: corsOriginPolicy(corsOrigins) }))
  app.use(express.json())

  app.get('/', (_req, res) => res.send('Hi'))
  app.use(DATOM_API_PATH.ROOT, createDatomsRouter(datomService, { heartbeatMs }))

  /** @type {import('express').ErrorRequestHandler} */
  // eslint-disable-next-line no-unused-vars
  const jsonErrorHandler = (err, _req, res, _next) => {
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

  // Four-argument signature is required for Express error middleware.
  app.use(jsonErrorHandler)

  return app
}
