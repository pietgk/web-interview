import { Router } from 'express'
import type { Response } from 'express'
import { constants as HTTP } from 'node:http2'
import { datomsRequestSchema } from '@web-interview/todos/datom'
import {
  API_ERROR_CODE,
  CLOCK_EVENT,
  EPOCH_EVENT,
  HEARTBEAT_INTERVAL_MS,
  TX_FUTURE_TOLERANCE_MS,
} from '@web-interview/todos/protocol'
import { ULID_PATTERN, ulidTime } from '@web-interview/todos/ulid'
import type { Datom } from '@web-interview/todos/types'
import type { ZodError } from 'zod'
import type { DatomService } from '../todos/datomService.ts'

const formatZodIssues = (error: ZodError) =>
  error.issues.map((issue) => ({ path: issue.path, message: issue.message }))

const asCursor = (value: unknown) =>
  typeof value === 'string' && ULID_PATTERN.test(value) ? value : undefined

export const createDatomsRouter = (
  service: DatomService,
  { heartbeatMs = HEARTBEAT_INTERVAL_MS }: { heartbeatMs?: number | undefined } = {}
) => {
  const router = Router()
  const subscribers = new Set<Response>()

  const writeDatom = (res: Response, datom: Datom) => {
    // `id` duplicates the datom's fourth element on purpose: `data` is the fact,
    // `id` is the browser's cursor bookkeeping.
    res.write(`id: ${datom[3]}\ndata: ${JSON.stringify(datom)}\n\n`)
  }

  /**
   * Carries server time and keeps the connection open through proxies. It must
   * not carry an `id`: any event with one overwrites the browser's
   * `Last-Event-ID`, and a clock tick is not a position in the datom log.
   */
  const writeClock = (res: Response) => {
    res.write(
      `event: ${CLOCK_EVENT}\ndata: ${JSON.stringify({ serverTime: service.now() })}\n\n`
    )
  }

  /**
   * Says which log this stream is serving, so a client holding a replaced one can
   * forget it. Carries no `id`, for the same reason the clock does not.
   */
  const writeEpoch = (res: Response) => {
    res.write(
      `event: ${EPOCH_EVENT}\ndata: ${JSON.stringify({ epoch: service.epoch })}\n\n`
    )
  }

  router.get('/stream', (req, res) => {
    // An auto-reconnect re-requests the original URL carrying its now-stale
    // `?since=` alongside a fresh header, so the header wins.
    const since = asCursor(req.get('Last-Event-ID')) ?? asCursor(req.query['since'])

    res.writeHead(HTTP.HTTP_STATUS_OK, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.flushHeaders()

    // The epoch comes first, so a client can drop a replaced log before folding
    // anything from this one into it. The clock comes last, so a client that has
    // a server time also has the state that came with it and can enable editing
    // without flashing an empty app.
    writeEpoch(res)
    for (const datom of service.store.datomsSince(since)) writeDatom(res, datom)
    writeClock(res)

    subscribers.add(res)
    const heartbeat = setInterval(() => writeClock(res), heartbeatMs)
    heartbeat.unref?.()
    req.on('close', () => {
      clearInterval(heartbeat)
      subscribers.delete(res)
    })
  })

  router.post('/', async (req, res) => {
    const parsed = datomsRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(HTTP.HTTP_STATUS_BAD_REQUEST).json({
        error: 'Validation failed',
        code: API_ERROR_CODE.VALIDATION_ERROR,
        issues: formatZodIssues(parsed.error),
      })
    }

    // A past-dated `tx` is harmless because it loses. A future-dated one wins
    // every conflict until wall time catches up.
    const horizon = service.now() + TX_FUTURE_TOLERANCE_MS
    if (parsed.data.datoms.some((datom) => ulidTime(datom[3]) > horizon)) {
      return res.status(HTTP.HTTP_STATUS_BAD_REQUEST).json({
        error: 'Transaction id is dated too far into the future',
        code: API_ERROR_CODE.INVALID_DATOM,
      })
    }

    const winners = await service.record(parsed.data.datoms)
    for (const subscriber of subscribers) {
      for (const datom of winners) writeDatom(subscriber, datom)
    }

    return res.status(HTTP.HTTP_STATUS_OK).json({ serverTime: service.now() })
  })

  return router
}
