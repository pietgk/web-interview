import { afterEach, describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { openDatomStream } from './sseClient.js'

const HTTP_OK_STATUS = 200
const FIRST_CHUNK_DELAY_MS = 10
const SECOND_CHUNK_DELAY_MS = 20

/**
 * Most of the datom API suite reads the stream through `openDatomStream`, so a
 * reader that mis-frames would let those tests agree with a broken server.
 * These tests pin the framing rules the reader assumes, against a real socket
 * rather than a stubbed one, so chunk boundaries are genuinely exercised.
 */

/** @type {Array<() => Promise<void> | void>} */
let cleanups = []

afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup()
  cleanups = []
})

/** @param {(request: import('node:http').IncomingMessage, write: (chunk: string) => void) => void} onStream */
const startServer = async (onStream) => {
  /** @type {import('node:http').IncomingMessage[]} */
  const requests = []
  const server = createServer((request, response) => {
    requests.push(request)
    response.writeHead(HTTP_OK_STATUS, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    })
    response.flushHeaders()
    onStream(request, (chunk) => response.write(chunk))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  cleanups.push(() => new Promise((resolve) => server.close(() => resolve(undefined))))
  const address = /** @type {import('node:net').AddressInfo} */ (server.address())
  return { baseUrl: `http://127.0.0.1:${address.port}`, requests }
}

/** @param {Awaited<ReturnType<typeof openDatomStream>>} client */
const closing = (client) => {
  cleanups.push(() => client.close())
  return client
}

/** @param {string} id */
const datom = (id) => `id: ${id}\ndata: ${JSON.stringify([`todo:${id}`, 'text', 'a', id, true])}\n\n`

describe('sse client', () => {
  it('joins a frame that arrives split across two chunks', async () => {
    const { baseUrl } = await startServer((_request, write) => {
      // The split lands inside the data line, and again between the two
      // newlines that terminate the frame - both are real socket behaviour.
      write('id: 01\ndata: {"half"')
      setTimeout(() => write(':true}\n'), FIRST_CHUNK_DELAY_MS)
      setTimeout(() => write('\n'), SECOND_CHUNK_DELAY_MS)
    })

    const client = closing(await openDatomStream(baseUrl))
    const events = await client.until((seen) => seen.length === 1)

    assert.equal(events.length, 1)
    assert.equal(events[0].id, '01')
    assert.equal(events[0].type, 'message')
    assert.equal(events[0].data, '{"half":true}')
  })

  it('reads a named event and leaves its id undefined', async () => {
    const { baseUrl } = await startServer((_request, write) => {
      write(`event: clock\ndata: ${JSON.stringify({ serverTime: 7 })}\n\n`)
    })

    const client = closing(await openDatomStream(baseUrl))
    const [event] = await client.until((seen) => seen.length === 1)

    assert.equal(event.type, 'clock')
    // An id here would overwrite the browser's Last-Event-ID with a non-position.
    assert.equal(event.id, undefined)
  })

  it('returns datoms in delivery order and ignores events that are not datoms', async () => {
    const { baseUrl } = await startServer((_request, write) => {
      write(`event: epoch\ndata: ${JSON.stringify({ epoch: 'e1' })}\n\n`)
      write(datom('01'))
      write(datom('02'))
      write(`event: clock\ndata: ${JSON.stringify({ serverTime: 1 })}\n\n`)
    })

    const client = closing(await openDatomStream(baseUrl))
    await client.until((seen) => seen.length === 4)

    assert.deepEqual(
      client.datoms().map((entry) => entry[3]),
      ['01', '02']
    )
  })

  it('sends the cursor as a query parameter and Last-Event-ID as a header', async () => {
    const { baseUrl, requests } = await startServer((_request, write) => write(datom('01')))

    const client = closing(
      await openDatomStream(baseUrl, { since: '01J0', lastEventId: '01J9' })
    )
    await client.until((seen) => seen.length === 1)

    assert.equal(requests.length, 1)
    assert.equal(new URL(requests[0].url ?? '', baseUrl).pathname, '/api/datoms/stream')
    assert.equal(new URL(requests[0].url ?? '', baseUrl).searchParams.get('since'), '01J0')
    assert.equal(requests[0].headers['last-event-id'], '01J9')
  })

  it('omits the header entirely when no Last-Event-ID is given', async () => {
    const { baseUrl, requests } = await startServer((_request, write) => write(datom('01')))

    const client = closing(await openDatomStream(baseUrl))
    await client.until((seen) => seen.length === 1)

    assert.equal(requests[0].headers['last-event-id'], undefined)
    assert.equal(new URL(requests[0].url ?? '', baseUrl).searchParams.has('since'), false)
  })

  it('reports what it did see when the wait times out', async () => {
    const { baseUrl } = await startServer((_request, write) => write(datom('01')))

    const client = closing(await openDatomStream(baseUrl))
    await assert.rejects(
      () => client.until((seen) => seen.length === 2, 50),
      // The message has to carry the events, or a timeout says nothing about why.
      (error) => /Timed out waiting for stream events/.test(String(error)) && /01/.test(String(error))
    )
  })

  it('holds a partial frame back until it is terminated', async () => {
    const { baseUrl } = await startServer((_request, write) => {
      write('id: 01\ndata: {"pending":true}\n')
    })

    const client = closing(await openDatomStream(baseUrl))
    await assert.rejects(() => client.until((seen) => seen.length > 0, 50))
  })
})
