import { DatomStore } from '@web-interview/todos/datom-store'
import { CLOCK_EVENT, EPOCH_EVENT } from '@web-interview/todos/protocol'

const HTTP_OK_STATUS = 200

/** @typedef {import('@web-interview/todos/types').Datom} Datom */

/**
 * An in-memory stand-in for the datom endpoints: one authoritative `DatomStore`,
 * an `EventSource` that replays the compacted set and then broadcasts winners,
 * and a `fetch` that journals nothing but applies and echoes.
 *
 * @param {{startTime?: number}} [options]
 */
export const createFakeDatomServer = ({ startTime = 1_760_000_000_000 } = {}) => {
  const store = new DatomStore()
  /** @type {Set<FakeEventSource>} */
  const connections = new Set()
  let serverTime = startTime
  let reachable = true
  // The log is identified by its own first datom, exactly as the server does it.
  /** @type {string | null} */
  let epoch = null

  /** @param {Datom[]} datoms */
  const broadcast = (datoms) => {
    for (const connection of connections) {
      for (const datom of datoms) connection.emitDatom(datom)
    }
  }

  class FakeEventSource {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSED = 2

    /** @type {((event: unknown) => void) | null} */
    onopen = null
    /** @type {((event: unknown) => void) | null} */
    onmessage = null
    /** @type {((event: unknown) => void) | null} */
    onerror = null

    /** @type {Map<string, Array<(event: unknown) => void>>} */
    #typed = new Map()

    /** @param {string} url */
    constructor(url) {
      this.url = url
      this.readyState = FakeEventSource.CONNECTING
      queueMicrotask(() => this.#connect())
    }

    /** @param {string} type @param {(event: unknown) => void} listener */
    addEventListener(type, listener) {
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

    /** @param {Datom} datom */
    emitDatom(datom) {
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

  /** @type {typeof fetch} */
  const fetchImpl = async (_url, init) => {
    if (!reachable) throw new TypeError('Failed to fetch')
    const { datoms } = JSON.parse(String(init?.body))
    broadcast(datoms.filter((/** @type {Datom} */ datom) => store.apply(datom)))
    return /** @type {Response} */ (/** @type {unknown} */ ({
      ok: true,
      status: HTTP_OK_STATUS,
      json: async () => ({ serverTime }),
    }))
  }

  return {
    store,
    FakeEventSource,
    fetchImpl,
    connections,
    /** @param {Datom[]} datoms */
    seed: (datoms) => {
      epoch ??= datoms[0]?.[3] ?? null
      for (const datom of datoms) store.apply(datom)
    },

    /**
     * Wipes the log and seeds a new one, as a server reset from empty would.
     *
     * @param {Datom[]} datoms
     */
    replaceLog: (datoms) => {
      store.clear()
      epoch = datoms[0]?.[3] ?? null
      for (const datom of datoms) store.apply(datom)
      for (const connection of [...connections]) connection.drop()
    },
    /** @param {Datom[]} datoms as if written by another client */
    push: (datoms) => {
      broadcast(datoms.filter((datom) => store.apply(datom)))
    },
    serverTime: () => serverTime,
    /** @param {number} ms */
    advance: (ms) => (serverTime += ms),
    disconnect: () => {
      reachable = false
      for (const connection of [...connections]) connection.drop()
    },
    reconnect: () => {
      reachable = true
    },
  }
}
