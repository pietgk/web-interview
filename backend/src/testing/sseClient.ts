/**
 * Reads *this server's* Server-Sent Events dialect, for tests, because Node has
 * no `EventSource`.
 *
 * It is not a spec-compliant SSE client and should not be reused as one. It
 * assumes what `routes/datoms.ts` actually writes:
 *
 * - frames separated by `\n\n`, never `\r\n\r\n`
 * - exactly one `data:` line per frame; a second would overwrite the first
 *   rather than joining with a newline as the spec requires. Safe here only
 *   because every payload is `JSON.stringify`, which escapes newlines.
 * - a space after the field name (`id: `, not `id:`)
 * - no comment (`:`) lines; this server heartbeats with a `clock` event instead
 *
 * `sseClient.test.ts` pins each of those assumptions, because most of the datom
 * API suite reads its stream through here and a reader that silently mis-frames
 * would make those tests agree with a broken server.
 */

import type { Datom } from '@web-interview/todos/types'

export type ServerSentEvent = { type: string, data: string, id: string | undefined }

const STREAM_POLL_INTERVAL_MS = 10

const parseFrame = (frame: string): ServerSentEvent => {
  const event: ServerSentEvent = { type: 'message', data: '', id: undefined }
  for (const line of frame.split('\n')) {
    if (line.startsWith('id: ')) event.id = line.slice(4)
    else if (line.startsWith('event: ')) event.type = line.slice(7)
    else if (line.startsWith('data: ')) event.data = line.slice(6)
  }
  return event
}

export const openDatomStream = async (
  baseUrl: string,
  { since, lastEventId }: { since?: string, lastEventId?: string } = {}
) => {
  const url = new URL('/api/datoms/stream', baseUrl)
  if (since) url.searchParams.set('since', since)

  const controller = new AbortController()
  const response = await fetch(url, {
    signal: controller.signal,
    headers: lastEventId ? { 'Last-Event-ID': lastEventId } : {},
  })

  const events: ServerSentEvent[] = []
  const decoder = new TextDecoder()
  let buffer = ''

  const pump = async () => {
    const reader = (response.body as ReadableStream<Uint8Array>).getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let boundary = buffer.indexOf('\n\n')
        while (boundary !== -1) {
          events.push(parseFrame(buffer.slice(0, boundary)))
          buffer = buffer.slice(boundary + 2)
          boundary = buffer.indexOf('\n\n')
        }
      }
    } catch {
      // The test aborted the stream.
    }
  }
  void pump()

  return {
    response,
    events,
    /** Datoms only, in delivery order. */
    datoms: (): Datom[] =>
      events
        .filter((event) => event.type === 'message')
        .map((event) => JSON.parse(event.data)),
    async until(
      predicate: (events: ServerSentEvent[]) => boolean,
      timeoutMs = 3_000
    ) {
      const deadline = Date.now() + timeoutMs
      while (!predicate(events)) {
        if (Date.now() > deadline) {
          throw new Error(`Timed out waiting for stream events: ${JSON.stringify(events)}`)
        }
        await new Promise((resolve) => setTimeout(resolve, STREAM_POLL_INTERVAL_MS))
      }
      return events
    },
    close: () => controller.abort(),
  }
}
