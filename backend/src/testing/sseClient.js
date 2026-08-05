/**
 * Reads *this server's* Server-Sent Events dialect, for tests, because Node has
 * no `EventSource`.
 *
 * It is not a spec-compliant SSE client and should not be reused as one. It
 * assumes what `routes/datoms.js` actually writes:
 *
 * - frames separated by `\n\n`, never `\r\n\r\n`
 * - exactly one `data:` line per frame; a second would overwrite the first
 *   rather than joining with a newline as the spec requires. Safe here only
 *   because every payload is `JSON.stringify`, which escapes newlines.
 * - a space after the field name (`id: `, not `id:`)
 * - no comment (`:`) lines; this server heartbeats with a `clock` event instead
 *
 * `sseClient.test.js` pins each of those assumptions, because most of the datom
 * API suite reads its stream through here and a reader that silently mis-frames
 * would make those tests agree with a broken server.
 */

/** @typedef {{type: string, data: string, id: string | undefined}} ServerSentEvent */

/** @param {string} frame @returns {ServerSentEvent} */
const parseFrame = (frame) => {
  /** @type {ServerSentEvent} */
  const event = { type: 'message', data: '', id: undefined }
  for (const line of frame.split('\n')) {
    if (line.startsWith('id: ')) event.id = line.slice(4)
    else if (line.startsWith('event: ')) event.type = line.slice(7)
    else if (line.startsWith('data: ')) event.data = line.slice(6)
  }
  return event
}

/**
 * @param {string} baseUrl
 * @param {{since?: string, lastEventId?: string}} [options]
 */
export const openDatomStream = async (baseUrl, { since, lastEventId } = {}) => {
  const url = new URL('/api/datoms/stream', baseUrl)
  if (since) url.searchParams.set('since', since)

  const controller = new AbortController()
  const response = await fetch(url, {
    signal: controller.signal,
    headers: lastEventId ? { 'Last-Event-ID': lastEventId } : {},
  })

  /** @type {ServerSentEvent[]} */
  const events = []
  const decoder = new TextDecoder()
  let buffer = ''

  const pump = async () => {
    const reader = /** @type {ReadableStream<Uint8Array>} */ (response.body).getReader()
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
    /** Datoms only, in delivery order. @returns {import('@web-interview/todos/types').Datom[]} */
    datoms: () =>
      events
        .filter((event) => event.type === 'message')
        .map((event) => JSON.parse(event.data)),
    /**
     * @param {(events: ServerSentEvent[]) => boolean} predicate
     * @param {number} [timeoutMs]
     */
    async until(predicate, timeoutMs = 3_000) {
      const deadline = Date.now() + timeoutMs
      while (!predicate(events)) {
        if (Date.now() > deadline) {
          throw new Error(`Timed out waiting for stream events: ${JSON.stringify(events)}`)
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      return events
    },
    close: () => controller.abort(),
  }
}
