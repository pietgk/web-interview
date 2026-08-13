import { DatomStore } from '@web-interview/todos/datom-store'
import { CLOCK_EVENT, EPOCH_EVENT } from '@web-interview/todos/protocol'
import type { Datom } from '@web-interview/todos/types'

const HTTP_OK_STATUS = 200

/**
 * An in-memory stand-in for the datom endpoints: one authoritative `DatomStore`,
 * an `EventSource` that replays the compacted set and then broadcasts winners,
 * and a `fetch` that journals nothing but applies and echoes.
 */
export const createFakeDatomServer = ({ startTime = 1_760_000_000_000 }: {startTime?: number | undefined} = {}) => {
  const store = new DatomStore()
  let serverTime = startTime
  let reachable = true
  // The log is identified by its own first datom, exactly as the server does it.
  let epoch: string | null = null

  class FakeEventSource {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSED = 2

    onopen: ((event: unknown) => void) | null = null
    onmessage: ((event: unknown) => void) | null = null
    onerror: ((event: unknown) => void) | null = null
    url: string
    readyState: number

    #typed: Map<string, Array<(event: unknown) => void>> = new Map()

    constructor(url: string) {
      this.url = url
      this.readyState = FakeEventSource.CONNECTING
      queueMicrotask(() => this.#connect())
    }

    addEventListener(type: string, listener: (event: unknown) => void) {
      this.#typed.set(type, [...(this.#typed.get(type) ?? []), listener])
    }

    #connect() {
      if (this.readyState === FakeEventSource.CLOSED) return
      if (!reachable) {
        this.onerror?.({ type: 'error' })
        return
      }
      this.readyState = FakeEventSource.OPEN
      this.onopen?.({ type: 'open' })
      this.emitEpoch()
      const since = new URL(this.url, 'http://fake').searchParams.get('since')
      for (const datom of store.datomsSince(since ?? undefined)) this.emitDatom(datom)
      this.emitClock()
      connections.add(this)
    }

    emitDatom(datom: Datom) {
      this.onmessage?.({ data: JSON.stringify(datom), lastEventId: datom[3] })
    }

    emitClock() {
      for (const listener of this.#typed.get(CLOCK_EVENT) ?? []) {
        listener({ data: JSON.stringify({ serverTime }) })
      }
    }

    emitEpoch() {
      for (const listener of this.#typed.get(EPOCH_EVENT) ?? []) {
        listener({ data: JSON.stringify({ epoch }) })
      }
    }

    drop() {
      this.readyState = FakeEventSource.CONNECTING
      connections.delete(this)
      this.onerror?.({ type: 'error' })
      // A real EventSource retries on its own. `#connect` does not schedule a
      // further retry when the server is unreachable, so this cannot spin.
      queueMicrotask(() => this.#connect())
    }

    close() {
      this.readyState = FakeEventSource.CLOSED
      connections.delete(this)
    }
  }

  const connections: Set<FakeEventSource> = new Set()

  const broadcast = (datoms: Datom[]) => {
    for (const connection of connections) {
      for (const datom of datoms) connection.emitDatom(datom)
    }
  }

  const fetchImpl: typeof fetch = async (_url, init) => {
    if (!reachable) throw new TypeError('Failed to fetch')
    const { datoms } = JSON.parse(String(init?.body))
    broadcast(datoms.filter((datom: Datom) => store.apply(datom)))
    return {
      ok: true,
      status: HTTP_OK_STATUS,
      json: async () => ({ serverTime }),
    } as unknown as Response
  }

  return {
    store,
    FakeEventSource,
    fetchImpl,
    connections,
    seed: (datoms: Datom[]) => {
      epoch ??= datoms[0]?.[3] ?? null
      for (const datom of datoms) store.apply(datom)
    },

    /**
     * Wipes the log and seeds a new one, as a server reset from empty would.
     */
    replaceLog: (datoms: Datom[]) => {
      store.clear()
      epoch = datoms[0]?.[3] ?? null
      for (const datom of datoms) store.apply(datom)
      for (const connection of [...connections]) connection.drop()
    },
    /** as if written by another client */
    push: (datoms: Datom[]) => {
      broadcast(datoms.filter((datom) => store.apply(datom)))
    },
    serverTime: () => serverTime,
    advance: (ms: number) => (serverTime += ms),
    disconnect: () => {
      reachable = false
      for (const connection of [...connections]) connection.drop()
    },
    reconnect: () => {
      reachable = true
    },
  }
}
