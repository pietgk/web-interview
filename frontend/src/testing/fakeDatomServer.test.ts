import { ATTRIBUTE } from '@web-interview/todos/datom'
import { listId, todoId, ulid } from '@web-interview/todos/ulid'
import type { Datom } from '@web-interview/todos/types'
import { createFakeDatomServer } from './fakeDatomServer.ts'

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
    expect(server.store.readModel()[list]?.title).toBe('Seeded')

    const seen: Datom[] = []
    source.onmessage = (event) => seen.push(JSON.parse((event as {data: string}).data))
    const remote = [
      todo,
      ATTRIBUTE.TEXT,
      'Remote',
      ulid(4),
      true,
    ] as Datom
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
