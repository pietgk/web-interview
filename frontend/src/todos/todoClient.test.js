import { ATTRIBUTE } from '@web-interview/todos/datom'
import { CONNECTION, SAVING_INDICATOR_DELAY_MS } from '@web-interview/todos/protocol'
import { listId, ulid } from '@web-interview/todos/ulid'
import { createFakeDatomServer } from '../testing/fakeDatomServer'
import { createTodoClient } from './todoClient'
import { createTodoListCommands } from './todoListCommands'

/**
 * @param {ReturnType<typeof createFakeDatomServer>} server
 * @param {Partial<Parameters<typeof createTodoClient>[0]>} [overrides]
 */
const clientFor = (server, overrides = {}) =>
  createTodoClient({
    apiBase: '',
    EventSourceImpl: /** @type {typeof EventSource} */ (
      /** @type {unknown} */ (server.FakeEventSource)
    ),
    fetchImpl: server.fetchImpl,
    ...overrides,
  })

/** @param {() => boolean} predicate */
const waitUntil = async (predicate) => {
  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    if (predicate()) return
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('timed out waiting for client condition')
}

describe('createTodoClient', () => {
  it('reconnect() rebuilds the stream after a hard failure', async () => {
    const server = createFakeDatomServer({ startTime: 1_000 })
    const client = clientFor(server)
    client.start()
    await waitUntil(() => client.getStatus().connection === CONNECTION.LIVE)

    server.disconnect()
    await waitUntil(() => client.getStatus().connection !== CONNECTION.LIVE)

    server.reconnect()
    client.reconnect()
    expect(client.getStatus().connection).toBe(CONNECTION.CONNECTING)
    await waitUntil(() => client.getStatus().connection === CONNECTION.LIVE)
    expect(client.getStatus().canEdit).toBe(true)

    client.stop()
  })

  it('reconnect() resumes with ?since= after the client has a cursor', async () => {
    const server = createFakeDatomServer({ startTime: 1_000 })
    const seeded = listId(1_000)
    server.seed([[seeded, ATTRIBUTE.TITLE, 'Seeded', ulid(1_000), true]])
    const client = clientFor(server)
    client.start()
    await waitUntil(() => client.getStatus().canEdit)
    expect(client.getReadModel()[seeded].title).toBe('Seeded')

    client.reconnect()
    await waitUntil(() =>
      [...server.connections].some((source) => source.url.includes('since='))
    )
    await waitUntil(() => client.getStatus().connection === CONNECTION.LIVE)

    client.stop()
  })

  it('surfaces a permanent server rejection and drops the refused datom', async () => {
    const server = createFakeDatomServer({ startTime: 1_000 })
    const client = clientFor(server, {
      fetchImpl: async () =>
        /** @type {Response} */ (
          /** @type {unknown} */ ({
            ok: false,
            status: 400,
            json: async () => ({}),
          })
        ),
    })
    client.start()
    await waitUntil(() => client.getStatus().canEdit)

    const commands = createTodoListCommands(client)
    const id = commands.reserveListId()
    commands.renameList(id, 'Refused')
    await waitUntil(() => client.getStatus().error !== null)

    expect(client.getStatus().error).toBe('The server rejected a change (400)')
    expect(client.getStatus().pendingCount).toBe(0)
    // Optimistic apply still happened locally; the gate is that the outbox moved on.
    expect(client.getReadModel()[id].title).toBe('Refused')

    client.stop()
  })

  it('retries the outbox after a transient network failure', async () => {
    vi.useFakeTimers()
    try {
      const server = createFakeDatomServer({ startTime: 1_000 })
      let reachable = true
      /** @type {import('@web-interview/todos/types').Datom[][]} */
      const posted = []
      const client = clientFor(server, {
        fetchImpl: async (_url, init) => {
          if (!reachable) throw new TypeError('Failed to fetch')
          const { datoms } = JSON.parse(String(init?.body))
          posted.push(datoms)
          return server.fetchImpl(_url, init)
        },
      })
      client.start()
      await vi.waitUntil(() => client.getStatus().canEdit)

      reachable = false
      const commands = createTodoListCommands(client)
      const id = commands.reserveListId()
      commands.renameList(id, 'Queued')
      await vi.waitUntil(() => client.getStatus().error === 'Could not reach the server')
      expect(client.getStatus().pendingCount).toBe(1)

      // A second failure while the retry timer is armed must not stack timers.
      commands.renameList(id, 'Still queued')
      await vi.waitUntil(() => client.getStatus().pendingCount === 2)

      reachable = true
      await vi.advanceTimersByTimeAsync(1_000)
      await vi.waitUntil(() => client.getStatus().pendingCount === 0)

      expect(client.getStatus().error).toBe(null)
      expect(posted.length).toBeGreaterThanOrEqual(1)
      expect(posted.at(-1)?.at(-1)?.[2]).toBe('Still queued')

      client.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not flash Saving when the outbox drains before the delay', async () => {
    vi.useFakeTimers()
    try {
      const server = createFakeDatomServer({ startTime: 1_000 })
      const client = clientFor(server)
      client.start()
      await vi.waitUntil(() => client.getStatus().canEdit)

      createTodoListCommands(client).renameList(client.newListId(), 'Fast')
      await vi.waitUntil(() => client.getStatus().pendingCount === 0)
      expect(client.getStatus().saving).toBe(false)

      await vi.advanceTimersByTimeAsync(SAVING_INDICATOR_DELAY_MS)
      expect(client.getStatus().saving).toBe(false)

      client.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears a pending Saving timer when the client stops mid-flight', async () => {
    vi.useFakeTimers()
    try {
      const server = createFakeDatomServer({ startTime: 1_000 })
      const client = clientFor(server)
      client.start()
      await vi.waitUntil(() => client.getStatus().canEdit)

      // A queued datom schedules the 300ms Saving timer. Stopping before the POST
      // settles leaves that timer pending, and nothing else would ever clear it:
      // it would fire against a client that is no longer running and announce
      // "Saving..." for work that has been abandoned.
      createTodoListCommands(client).renameList(client.newListId(), 'Interrupted')
      expect(client.getStatus().pendingCount).toBe(1)
      client.stop()

      await vi.advanceTimersByTimeAsync(SAVING_INDICATOR_DELAY_MS * 2)
      expect(client.getStatus().saving).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('fails closed when the browser has no EventSource', () => {
    const client = createTodoClient({
      EventSourceImpl: /** @type {typeof EventSource} */ (
        /** @type {unknown} */ (undefined)
      ),
    })
    client.start()
    expect(client.getStatus()).toMatchObject({
      connection: CONNECTION.FAILED,
      error: 'This browser cannot receive live updates',
    })
    client.stop()
  })

  it('marks the connection failed when the EventSource closes for good', async () => {
    class ClosedEventSource {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSED = 2

      /** @type {((event: unknown) => void) | null} */
      onopen = null
      /** @type {((event: unknown) => void) | null} */
      onmessage = null
      /** @type {((event: unknown) => void) | null} */
      onerror = null
      readyState = ClosedEventSource.CONNECTING

      constructor() {
        queueMicrotask(() => {
          this.readyState = ClosedEventSource.CLOSED
          this.onerror?.({ type: 'error' })
        })
      }

      addEventListener() {}
      close() {
        this.readyState = ClosedEventSource.CLOSED
      }
    }

    const client = createTodoClient({
      EventSourceImpl: /** @type {typeof EventSource} */ (
        /** @type {unknown} */ (ClosedEventSource)
      ),
      fetchImpl: async () => {
        throw new Error('unexpected fetch')
      },
    })
    client.start()
    await waitUntil(() => client.getStatus().connection === CONNECTION.FAILED)
    client.stop()
  })

  it('ignores stream errors after stop, and refuses a second start while live', async () => {
    const server = createFakeDatomServer({ startTime: 1_000 })
    const client = clientFor(server)
    client.start()
    await waitUntil(() => client.getStatus().connection === CONNECTION.LIVE)
    client.start()
    expect(client.getStatus().connection).toBe(CONNECTION.LIVE)

    const source = [...server.connections][0]
    client.stop()
    source.onerror?.({ type: 'error' })
    expect(client.getStatus().connection).toBe(CONNECTION.LIVE)
  })

  it('falls back to the datom tx when the stream omits lastEventId', async () => {
    const server = createFakeDatomServer({ startTime: 1_000 })
    const client = clientFor(server)
    client.start()
    await waitUntil(() => client.getStatus().canEdit)

    const source = [...server.connections][0]
    const entity = listId(2_000)
    const tx = ulid(2_000)
    /** @type {import('@web-interview/todos/types').Datom} */
    const datom = [entity, ATTRIBUTE.TITLE, 'From stream', tx, true]
    source.onmessage?.({ data: JSON.stringify(datom), lastEventId: '' })
    expect(client.getReadModel()[entity].title).toBe('From stream')

    client.stop()
  })

  it('ignores a clock event whose serverTime is not a number', async () => {
    /** @type {Array<(event: unknown) => void>} */
    let clockListeners = []
    class ClockEventSource {
      static CONNECTING = 0
      static OPEN = 1
      static CLOSED = 2

      /** @type {((event: unknown) => void) | null} */
      onopen = null
      /** @type {((event: unknown) => void) | null} */
      onmessage = null
      /** @type {((event: unknown) => void) | null} */
      onerror = null
      readyState = ClockEventSource.CONNECTING

      constructor() {
        queueMicrotask(() => {
          this.readyState = ClockEventSource.OPEN
          this.onopen?.({ type: 'open' })
          for (const listener of clockListeners) {
            listener({ data: JSON.stringify({ serverTime: 'nope' }) })
          }
        })
      }

      /** @param {string} type @param {(event: unknown) => void} listener */
      addEventListener(type, listener) {
        if (type === 'clock') clockListeners = [...clockListeners, listener]
      }

      close() {
        this.readyState = ClockEventSource.CLOSED
      }
    }

    const client = createTodoClient({
      EventSourceImpl: /** @type {typeof EventSource} */ (
        /** @type {unknown} */ (ClockEventSource)
      ),
      fetchImpl: async () => {
        throw new Error('unexpected fetch')
      },
    })
    client.start()
    await waitUntil(() => client.getStatus().connection === CONNECTION.LIVE)
    expect(client.getStatus().canEdit).toBe(false)
    client.stop()
  })

  it('does not write before the server clock arrives', () => {
    const server = createFakeDatomServer({ startTime: 1_000 })
    const client = clientFor(server)
    // Start but do not flush microtasks — the stream has not spoken yet.
    client.start()
    const commands = createTodoListCommands(client)
    const id = commands.reserveListId()
    commands.renameList(id, 'Too early')
    expect(client.getStatus().canEdit).toBe(false)
    expect(client.getReadModel()[id]).toBeUndefined()
    expect(client.getStatus().pendingCount).toBe(0)
    client.stop()
  })
})
