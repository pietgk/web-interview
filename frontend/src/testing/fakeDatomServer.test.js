import { ATTRIBUTE } from '@web-interview/todos/datom'
import { listId, todoId, ulid } from '@web-interview/todos/ulid'
import { createFakeDatomServer } from './fakeDatomServer'

describe('createFakeDatomServer', () => {
  it('seeds, broadcasts winners on push, and refuses traffic while disconnected', async () => {
    const server = createFakeDatomServer({ startTime: 1_000 })
    const list = listId(1)
    const todo = todoId(list, 2)
    server.seed([[list, ATTRIBUTE.TITLE, 'Seeded', ulid(3), true]])

    const source = new server.FakeEventSource('/api/datoms/stream')
    await Promise.resolve()
    await Promise.resolve()
    expect(source.readyState).toBe(server.FakeEventSource.OPEN)
    expect(server.store.readModel()[list].title).toBe('Seeded')

    /** @type {import('@web-interview/todos/types').Datom[]} */
    const seen = []
    source.onmessage = (event) => seen.push(JSON.parse(/** @type {{data: string}} */ (event).data))
    const remote = /** @type {import('@web-interview/todos/types').Datom} */ ([
      todo,
      ATTRIBUTE.TEXT,
      'Remote',
      ulid(4),
      true,
    ])
    server.push([remote])
    expect(seen).toEqual([remote])

    server.disconnect()
    await expect(server.fetchImpl('/api/datoms', { body: '{}' })).rejects.toThrow(/Failed to fetch/)
    expect(source.readyState).toBe(server.FakeEventSource.CONNECTING)

    server.reconnect()
    const restored = new server.FakeEventSource('/api/datoms/stream')
    await Promise.resolve()
    await Promise.resolve()
    expect(restored.readyState).toBe(server.FakeEventSource.OPEN)
  })
})
