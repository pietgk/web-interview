import { ATTRIBUTE } from '@web-interview/todos/datom'
import {
  API_ERROR_CODE,
  BROWSER_ERROR_CODE,
  CONNECTION,
  SAVING_INDICATOR_DELAY_MS,
} from '@web-interview/todos/protocol'
import { listId, todoId, ulid } from '@web-interview/todos/ulid'
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
  it('updates today at each local midnight while offline', async () => {
    vi.useFakeTimers()
    try {
      const startTime = new Date(2026, 6, 31, 23, 59, 59).getTime()
      const server = createFakeDatomServer({ startTime })
      const client = clientFor(server)
      let notifications = 0
      client.subscribeToday(() => { notifications += 1 })
      client.start()
      await vi.waitUntil(() => client.getToday() === '2026-07-31')
      expect(notifications).toBe(1)

      server.disconnect()
      await vi.advanceTimersByTimeAsync(1_000)
      expect(client.getToday()).toBe('2026-08-01')
      expect(notifications).toBe(2)

      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1_000)
      expect(client.getToday()).toBe('2026-08-02')
      expect(notifications).toBe(3)

      client.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('corrects and reschedules today from heartbeats without duplicate notifications', async () => {
    const startTime = new Date(2026, 6, 31, 12).getTime()
    const server = createFakeDatomServer({ startTime })
    const client = clientFor(server)
    let notifications = 0
    client.subscribeToday(() => { notifications += 1 })
    client.start()
    await waitUntil(() => client.getToday() === '2026-07-31')
    expect(notifications).toBe(1)
    const source = [...server.connections][0]

    server.advance(60 * 60 * 1_000)
    source.emitClock()
    expect(client.getToday()).toBe('2026-07-31')
    expect(notifications).toBe(1)

    server.advance(24 * 60 * 60 * 1_000)
    source.emitClock()
    expect(client.getToday()).toBe('2026-08-01')
    expect(notifications).toBe(2)

    client.stop()
  })

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

  it('restores authoritative state and preserves structured API rejection details', async () => {
    const server = createFakeDatomServer({ startTime: 1_000 })
    const id = listId(1_000)
    server.seed([[id, ATTRIBUTE.TITLE, 'Authoritative', ulid(1_000), true]])
    const client = clientFor(server, {
      fetchImpl: async () =>
        /** @type {Response} */ (
          /** @type {unknown} */ ({
            ok: false,
            status: 400,
            json: async () => ({
              error: 'Validation failed',
              code: API_ERROR_CODE.VALIDATION_ERROR,
              issues: [{ path: ['datoms', 0, 2], message: 'Invalid value for title' }],
            }),
          })
        ),
    })
    client.start()
    await waitUntil(() => client.getStatus().canEdit)

    const commands = createTodoListCommands(client)
    commands.renameList(id, 'Refused')
    await waitUntil(() => client.getStatus().failure !== null && client.getStatus().canEdit)

    expect(client.getStatus()).toMatchObject({
      pendingCount: 0,
      rehydrating: false,
      failure: {
        kind: 'api',
        status: 400,
        code: API_ERROR_CODE.VALIDATION_ERROR,
        message: 'Validation failed',
        issues: [{ path: ['datoms', 0, 2], message: 'Invalid value for title' }],
      },
    })
    expect(client.getReadModel()[id].title).toBe('Authoritative')

    client.stop()
  })

  it('rehydrates after rejection without losing or replaying a later write', async () => {
    const server = createFakeDatomServer({ startTime: 1_000 })
    const list = listId(1_000)
    const todo = todoId(list, 1_001)
    server.seed([
      [list, ATTRIBUTE.TITLE, 'List', ulid(1_000), true],
      [todo, ATTRIBUTE.TEXT, 'Authoritative', ulid(1_001), true],
    ])

    /** @type {Array<import('@web-interview/todos/types').Datom[]>} */
    const posted = []
    /** @type {Array<() => void>} */
    const release = []
    const client = clientFor(server, {
      fetchImpl: async (url, init) => {
        const { datoms } = JSON.parse(String(init?.body))
        posted.push(datoms)
        await new Promise((resolve) => release.push(() => resolve(undefined)))
        if (posted.length === 1) {
          return /** @type {Response} */ (/** @type {unknown} */ ({
            ok: false,
            status: 400,
            json: async () => ({
              error: 'Validation failed',
              code: API_ERROR_CODE.VALIDATION_ERROR,
            }),
          }))
        }
        return server.fetchImpl(url, init)
      },
    })
    /** @type {import('@web-interview/todos/types').TodoClientStatus[]} */
    const statuses = []
    client.subscribe(() => statuses.push(client.getStatus()))
    client.start()
    await waitUntil(() => client.getStatus().canEdit)

    const commands = createTodoListCommands(client)
    commands.retitleTodo(client.getReadModel()[list].todos[0], 'Rejected')
    await waitUntil(() => posted.length === 1)
    commands.retitleTodo(client.getReadModel()[list].todos[0], 'Written later')
    expect(client.getStatus().pendingCount).toBe(2)

    release[0]()
    await waitUntil(() => posted.length === 2)
    expect(statuses.some((status) => status.rehydrating && !status.canEdit)).toBe(true)
    expect(client.getReadModel()[list].todos[0].text).toBe('Written later')
    expect(client.getStatus()).toMatchObject({
      pendingCount: 1,
      failure: { kind: 'api', code: API_ERROR_CODE.VALIDATION_ERROR },
    })
    expect(posted[0][0][2]).toBe('Rejected')
    expect(posted[1]).toHaveLength(1)
    expect(posted[1][0][2]).toBe('Written later')

    release[1]()
    await waitUntil(() => client.getStatus().pendingCount === 0)
    expect(client.getStatus().failure).toBe(null)
    expect(server.store.readModel()[list].todos[0].text).toBe('Written later')

    client.stop()
  })

  it('treats an invalid successful response as a browser failure and rehydrates', async () => {
    const server = createFakeDatomServer({ startTime: 1_000 })
    const id = listId(1_000)
    server.seed([[id, ATTRIBUTE.TITLE, 'Authoritative', ulid(1_000), true]])
    const client = clientFor(server, {
      fetchImpl: async () =>
        /** @type {Response} */ (/** @type {unknown} */ ({
          ok: true,
          status: 200,
          json: async () => ({}),
        })),
    })
    const commands = createTodoListCommands(client)
    /** @type {string | null | undefined} */
    let todoDuringRehydration
    let attemptedDuringRehydration = false
    client.subscribe(() => {
      if (!client.getStatus().rehydrating || attemptedDuringRehydration) return
      attemptedDuringRehydration = true
      todoDuringRehydration = commands.addTodo(id, 'Too late')
    })
    client.start()
    await waitUntil(() => client.getStatus().canEdit)

    commands.renameList(id, 'Unconfirmed')
    await waitUntil(() => client.getStatus().failure !== null && client.getStatus().canEdit)

    expect(client.getStatus()).toMatchObject({
      pendingCount: 0,
      failure: {
        kind: 'invalid-response',
        status: 200,
        code: BROWSER_ERROR_CODE.INVALID_RESPONSE,
      },
    })
    expect(todoDuringRehydration).toBe(null)
    expect(client.getReadModel()[id].title).toBe('Authoritative')

    client.stop()
  })

  it('validates an unsuccessful response even when stopped before it arrives', async () => {
    const server = createFakeDatomServer({ startTime: 1_000 })
    const id = listId(1_000)
    server.seed([[id, ATTRIBUTE.TITLE, 'Authoritative', ulid(1_000), true]])
    /** @type {() => void} */
    let releaseResponse = () => {}
    let requestStarted = false
    const client = clientFor(server, {
      fetchImpl: async () => {
        requestStarted = true
        await new Promise((resolve) => {
          releaseResponse = () => resolve(undefined)
        })
        return /** @type {Response} */ (/** @type {unknown} */ ({
          ok: false,
          status: 502,
          json: async () => ({ message: 'Not the public API error shape' }),
        }))
      },
    })
    client.start()
    await waitUntil(() => client.getStatus().canEdit)

    createTodoListCommands(client).renameList(id, 'Unconfirmed')
    await waitUntil(() => requestStarted)
    client.stop()
    releaseResponse()
    await waitUntil(() => client.getStatus().failure !== null)

    expect(client.getStatus()).toMatchObject({
      canEdit: false,
      rehydrating: true,
      pendingCount: 0,
      failure: {
        kind: 'invalid-response',
        status: 502,
        code: BROWSER_ERROR_CODE.INVALID_RESPONSE,
      },
    })
    expect(server.connections.size).toBe(0)

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
      await vi.waitUntil(() => client.getStatus().failure?.code === BROWSER_ERROR_CODE.NETWORK_ERROR)
      expect(client.getStatus().pendingCount).toBe(1)

      // A second failure while the retry timer is armed must not stack timers.
      commands.renameList(id, 'Still queued')
      await vi.waitUntil(() => client.getStatus().pendingCount === 2)

      reachable = true
      await vi.advanceTimersByTimeAsync(1_000)
      await vi.waitUntil(() => client.getStatus().pendingCount === 0)

      expect(client.getStatus().failure).toBe(null)
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
      failure: {
        kind: 'network',
        code: BROWSER_ERROR_CODE.NETWORK_ERROR,
        message: 'This browser cannot receive live updates',
      },
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
