import { CONNECTION } from '@web-interview/todos/protocol'
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
    const listId = commands.reserveListId()
    commands.renameList(listId, 'Refused')
    await waitUntil(() => client.getStatus().error !== null)

    expect(client.getStatus().error).toBe('The server rejected a change (400)')
    expect(client.getStatus().pendingCount).toBe(0)
    // Optimistic apply still happened locally; the gate is that the outbox moved on.
    expect(client.getReadModel()[listId].title).toBe('Refused')

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
      const listId = commands.reserveListId()
      commands.renameList(listId, 'Queued')
      await vi.waitUntil(() => client.getStatus().error === 'Could not reach the server')
      expect(client.getStatus().pendingCount).toBe(1)

      reachable = true
      await vi.advanceTimersByTimeAsync(1_000)
      await vi.waitUntil(() => client.getStatus().pendingCount === 0)

      expect(client.getStatus().error).toBe(null)
      expect(posted).toHaveLength(1)
      expect(posted[0][0][2]).toBe('Queued')

      client.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('fails closed when the browser has no EventSource', async () => {
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
})
