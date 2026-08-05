import { afterEach, beforeEach, describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { constants as HTTP } from 'node:http2'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ATTRIBUTE } from '@web-interview/todos/datom'
import { ERROR_CODE } from '@web-interview/todos/protocol'
import { ulid, ulidTime } from '@web-interview/todos/ulid'
import { createApp } from './app.js'
import { DatomJournal } from './todos/datomJournal.js'
import { openDatomStream } from './testing/sseClient.js'
import { createDatomService } from './todos/datomService.js'

/** @typedef {import('@web-interview/todos/types').Datom} Datom */

const SEED = [{ title: 'First List', todos: [{ text: 'First todo', completed: false, dueDate: null }] }]

/**
 * The ULID generator is monotonic for the whole process, so a fake clock that
 * started behind it would silently mint future-dated ids. `ulid(0)` reports where
 * the generator currently is.
 */
const generatorTime = () => ulidTime(ulid(0))

/** @param {import('express').Express} app */
const listen = async (app) => {
  const server = createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  const address = /** @type {import('node:net').AddressInfo} */ (server.address())
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(() => resolve(undefined)))
    },
  }
}

describe('datom API', () => {
  /** @type {string} */
  let directory
  /** @type {string} */
  let filePath
  /** @type {Awaited<ReturnType<typeof createDatomService>>} */
  let service
  /** @type {Awaited<ReturnType<typeof listen>>} */
  let server
  /** @type {Array<{close: () => void}>} */
  let openStreams
  /** @type {number} */
  let serverTime

  const post = (
    /** @type {Datom[]} */ datoms,
    /** @type {RequestInit} */ init = {}
  ) =>
    fetch(`${server.baseUrl}/api/datoms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datoms }),
      ...init,
    })

  /** @param {Parameters<typeof openDatomStream>[1]} [options] */
  const stream = async (options) => {
    const client = await openDatomStream(server.baseUrl, options)
    openStreams.push(client)
    return client
  }

  /** Mints the next tx and moves the fake server clock with it. */
  const tx = () => ulid((serverTime += 1))

  beforeEach(async () => {
    serverTime = generatorTime() + 1_000
    openStreams = []
    directory = await mkdtemp(join(tmpdir(), 'datom-api-'))
    filePath = join(directory, 'datoms.jsonl')
    service = await createDatomService({ filePath, seed: SEED, now: () => serverTime })
    server = await listen(createApp(service, { heartbeatMs: 40 }))
  })

  afterEach(async () => {
    for (const client of openStreams) client.close()
    await server.close()
    await service.close()
    await rm(directory, { recursive: true, force: true })
  })

  const seededList = () => Object.keys(service.store.readModel())[0]
  const seededTodo = () => service.store.readModel()[seededList()].todos[0]

  it('returns the compacted current set on a fresh connect, not the journal', async () => {
    const list = seededList()
    await post([[list, ATTRIBUTE.TITLE, 'Renamed', tx(), true]])

    const client = await stream()
    await client.until(() => client.datoms().length >= 2)

    const titles = client
      .datoms()
      .filter(([entity, attribute]) => entity === list && attribute === ATTRIBUTE.TITLE)
    assert.deepEqual(titles.map(([, , value]) => value), ['Renamed'])
  })

  it('emits datoms in ascending tx order on a fresh connect', async () => {
    const client = await stream()
    await client.until(() => client.datoms().length >= 2)

    const order = client.datoms().map(([, , , transaction]) => transaction)
    assert.deepEqual(order, [...order].sort())
  })

  it('gives a client that was away the retraction for a Todo deleted while it was gone', async () => {
    const todo = seededTodo()
    const away = await stream()
    await away.until(() => away.datoms().length >= 2)
    const cursor = /** @type {string} */ (away.datoms().at(-1)?.[3])
    away.close()

    await post([[todo.id, ATTRIBUTE.TEXT, todo.text, tx(), false]])

    const returning = await stream({ since: cursor })
    await returning.until(() => returning.datoms().length >= 1)
    assert.deepEqual(returning.datoms(), [
      [todo.id, ATTRIBUTE.TEXT, todo.text, returning.datoms()[0][3], false],
    ])
  })

  it('names its log before sending any datom from it', async () => {
    const client = await stream()
    await client.until((events) => events.some((event) => event.type === 'clock'))

    assert.equal(client.events[0].type, 'epoch')
    assert.equal(client.events[0].id, undefined)
    assert.equal(JSON.parse(client.events[0].data).epoch, service.epoch)
    assert.equal(service.epoch, service.store.datomsSince()[0][3])
  })

  it('hands over server time only after the state that came with it', async () => {
    const client = await stream()
    await client.until((events) => events.some((event) => event.type === 'clock'))

    const firstClock = client.events.findIndex((event) => event.type === 'clock')
    const datomsBeforeClock = client.events
      .slice(0, firstClock)
      .filter((event) => event.type === 'message')
    assert.equal(
      datomsBeforeClock.length,
      service.store.datomsSince().length,
      'every datom of the compacted set precedes the first clock tick'
    )
  })

  it('sends a heartbeat that carries server time and no id field', async () => {
    const client = await stream()
    await client.until((events) => events.filter((event) => event.type === 'clock').length >= 2)

    for (const clock of client.events.filter((event) => event.type === 'clock')) {
      assert.equal(clock.id, undefined)
      assert.equal(JSON.parse(clock.data).serverTime, serverTime)
    }
  })

  it('prefers Last-Event-ID over a stale since parameter', async () => {
    const list = seededList()
    const opening = await stream()
    await opening.until(() => opening.datoms().length >= 2)
    const cursor = /** @type {string} */ (opening.datoms().at(-1)?.[3])
    opening.close()
    await post([[list, ATTRIBUTE.TITLE, 'Renamed', tx(), true]])

    const client = await stream({ since: undefined, lastEventId: cursor })
    await client.until(() => client.datoms().length >= 1)
    await new Promise((resolve) => setTimeout(resolve, 60))

    assert.equal(client.datoms().length, 1)
    assert.equal(client.datoms()[0][2], 'Renamed')
  })

  it('still converges from a stale since parameter, re-sending datoms harmlessly', async () => {
    const list = seededList()
    await post([[list, ATTRIBUTE.TITLE, 'Renamed', tx(), true]])
    const staleCursor = '0'.repeat(26)

    const client = await stream({ since: staleCursor })
    await client.until(() => client.datoms().length >= 2)

    const titles = client
      .datoms()
      .filter(([entity, attribute]) => entity === list && attribute === ATTRIBUTE.TITLE)
    assert.deepEqual(titles.map(([, , value]) => value), ['Renamed'])
  })

  it('broadcasts a winning datom to every open stream', async () => {
    const list = seededList()
    const first = await stream()
    const second = await stream()
    await first.until(() => first.datoms().length >= 2)
    await second.until(() => second.datoms().length >= 2)
    const before = first.datoms().length

    await post([[list, ATTRIBUTE.TITLE, 'Renamed', tx(), true]])

    await first.until(() => first.datoms().length > before)
    await second.until(() => second.datoms().length > before)
    assert.equal(first.datoms().at(-1)?.[2], 'Renamed')
    assert.equal(second.datoms().at(-1)?.[2], 'Renamed')
  })

  it('journals a stale datom but never broadcasts it', async () => {
    const list = seededList()
    const stale = tx()
    const winner = tx()
    await post([[list, ATTRIBUTE.TITLE, 'Winner', winner, true]])

    const client = await stream()
    await client.until(() => client.datoms().length >= 2)
    const before = client.datoms().length

    const response = await post([[list, ATTRIBUTE.TITLE, 'Stale', stale, true]])
    await new Promise((resolve) => setTimeout(resolve, 60))

    assert.equal(response.status, HTTP.HTTP_STATUS_OK)
    assert.equal(client.datoms().length, before)
    assert.equal(service.store.readModel()[list].title, 'Winner')
    assert.match(await readFile(filePath, 'utf8'), /"Stale"/)
  })

  it('accepts a tx in the past and lets it lose', async () => {
    const list = seededList()
    const yesterday = tx()
    serverTime += 86_400_000
    const winner = tx()
    await post([[list, ATTRIBUTE.TITLE, 'Winner', winner, true]])

    const response = await post([[list, ATTRIBUTE.TITLE, 'Yesterday', yesterday, true]])

    assert.equal(response.status, HTTP.HTTP_STATUS_OK)
    assert.equal(service.store.readModel()[list].title, 'Winner')
  })

  it('rejects a tx more than five seconds in the future', async () => {
    const list = seededList()
    const response = await post([[list, ATTRIBUTE.TITLE, 'From the future', ulid(serverTime + 5_001), true]])

    assert.equal(response.status, HTTP.HTTP_STATUS_BAD_REQUEST)
    assert.equal((/** @type {{code: string}} */ (await response.json())).code, ERROR_CODE.INVALID_DATOM)
    assert.notEqual(service.store.readModel()[list].title, 'From the future')
  })

  it('makes a client\'s own datom a no-op when the server echoes it back', async () => {
    const list = seededList()
    const own = /** @type {Datom} */ ([list, ATTRIBUTE.TITLE, 'Renamed', tx(), true])
    const client = await stream()
    await client.until(() => client.datoms().length >= 2)

    await post([own])
    await client.until(() => client.datoms().some(([, , value]) => value === 'Renamed'))

    const echoed = client.datoms().find(([, , value]) => value === 'Renamed')
    assert.deepEqual(echoed, own, 'the echo is byte-identical, so re-applying it changes nothing')
  })

  it('rejects an invalid datom without changing the read model', async () => {
    const before = service.store.readModel()
    const response = await post(/** @type {Datom[]} */ (/** @type {unknown} */ ([
      ['0000000001', 'list/deleted', true, tx(), true],
    ])))

    assert.equal(response.status, HTTP.HTTP_STATUS_BAD_REQUEST)
    assert.equal((/** @type {{code: string}} */ (await response.json())).code, ERROR_CODE.VALIDATION)
    assert.equal(service.store.readModel(), before)
  })

  it('returns JSON for malformed JSON bodies', async () => {
    const response = await fetch(`${server.baseUrl}/api/datoms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"datoms":',
    })

    assert.equal(response.status, HTTP.HTTP_STATUS_BAD_REQUEST)
    assert.equal((/** @type {{code: string}} */ (await response.json())).code, ERROR_CODE.MALFORMED_JSON)
  })

  it('emits CORS headers only for configured origins', async () => {
    const configured = await listen(createApp(service, {
      corsOrigins: ['https://allowed.example'],
      heartbeatMs: 40,
    }))
    try {
      const allowed = await fetch(`${configured.baseUrl}/`, {
        headers: { Origin: 'https://allowed.example' },
      })
      const rejected = await fetch(`${configured.baseUrl}/`, {
        headers: { Origin: 'https://rejected.example' },
      })

      assert.equal(
        allowed.headers.get('access-control-allow-origin'),
        'https://allowed.example'
      )
      assert.equal(rejected.headers.get('access-control-allow-origin'), null)
    } finally {
      await configured.close()
    }
  })
})

describe('datom API durability', () => {
  it('does not answer a write until the journal has been synced', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'datom-durability-'))
    const serverTime = generatorTime() + 1_000
    const inner = new DatomJournal({ filePath: join(directory, 'datoms.jsonl') })

    /** @type {(() => void) | null} */
    let releaseSync = null
    let appends = 0
    const journal = /** @type {DatomJournal} */ (/** @type {unknown} */ ({
      filePath: inner.filePath,
      open: () => inner.open(),
      /** @param {import('@web-interview/todos/types').Datom[]} datoms */
      append: async (datoms) => {
        await inner.append(datoms)
        appends += 1
        if (appends === 1) return // the seed
        await new Promise((resolve) => { releaseSync = () => resolve(undefined) })
      },
      close: () => inner.close(),
    }))

    const service = await createDatomService({ seed: SEED, now: () => serverTime, journal })
    const server = await listen(createApp(service, { heartbeatMs: 1_000 }))
    try {
      const list = Object.keys(service.store.readModel())[0]
      let answered = false
      const request = fetch(`${server.baseUrl}/api/datoms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datoms: [[list, ATTRIBUTE.TITLE, 'Renamed', ulid(serverTime), true]] }),
      }).then((response) => {
        answered = true
        return response
      })

      await new Promise((resolve) => setTimeout(resolve, 100))
      assert.equal(answered, false, 'the response must wait for datasync()')

      const release = /** @type {() => void} */ (/** @type {unknown} */ (releaseSync))
      release()
      assert.equal((await request).status, HTTP.HTTP_STATUS_OK)
    } finally {
      await server.close()
      await service.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
})

describe('datom seed', () => {
  it('seeds Todo Lists in order, each Todo naming its Todo List', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'datom-seed-'))
    const service = await createDatomService({
      filePath: join(directory, 'datoms.jsonl'),
      seed: [
        { title: 'First List', todos: [{ text: 'Older', completed: false, dueDate: null }, { text: 'Newer', completed: true, dueDate: '2026-08-03' }] },
        { title: 'Second List', todos: [] },
      ],
    })
    try {
      const [first, second] = Object.values(service.store.readModel())
      assert.equal(first.title, 'First List')
      assert.equal(second.title, 'Second List')
      assert.deepEqual(first.todos.map((todo) => todo.text), ['Older', 'Newer'])
      assert.ok(first.todos.every((todo) => todo.id.startsWith(`${first.id}/T`)))
      assert.deepEqual(first.todos[1], {
        id: first.todos[1].id,
        text: 'Newer',
        completed: true,
        dueDate: '2026-08-03',
      })
    } finally {
      await service.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
