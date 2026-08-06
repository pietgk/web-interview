import { DatomStore } from '@web-interview/todos/datom-store'
import {
  CLOCK_EVENT,
  CONNECTION,
  DATOM_API_PATH,
  EPOCH_EVENT,
  SAVING_INDICATOR_DELAY_MS,
} from '@web-interview/todos/protocol'
import { createUlidMinter } from '@web-interview/todos/ulid'

/** @typedef {import('@web-interview/todos/types').Attribute} Attribute */
/** @typedef {import('@web-interview/todos/types').Datom} Datom */
/** @typedef {import('@web-interview/todos/types').FactValue} FactValue */
/** @typedef {import('@web-interview/todos/types').TodoClientStatus} TodoClientStatus */

const DEFAULT_API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')
const OUTBOX_RETRY_MS = 1_000
const EVENT_SOURCE_CLOSED = 2

/**
 * @param {TodoClientStatus} left
 * @param {TodoClientStatus} right
 */
const sameStatus = (left, right) =>
  left.connection === right.connection &&
  left.pendingCount === right.pendingCount &&
  left.saving === right.saving &&
  left.canEdit === right.canEdit &&
  left.error === right.error &&
  left.epoch === right.epoch

/**
 * The browser half of the log: a `DatomStore`, an `EventSource` reading it down,
 * an outbox POSTing it up, and a server-time source. It persists nothing.
 *
 * @param {object} [options]
 * @param {string} [options.apiBase]
 * @param {typeof EventSource} [options.EventSourceImpl]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {() => number} [options.monotonicNow]
 */
export const createTodoClient = ({
  apiBase = DEFAULT_API_BASE,
  EventSourceImpl = globalThis.EventSource,
  fetchImpl = (...args) => globalThis.fetch(...args),
  monotonicNow = () => performance.now(),
} = {}) => {
  const store = new DatomStore()
  /** @type {Datom[]} */
  const outbox = []
  /** @type {Set<() => void>} */
  const listeners = new Set()

  /** @type {EventSource | null} */
  let source = null
  /** @type {string | undefined} */
  let cursor
  /**
   * Which log the datoms in the store came from. Null until the stream says.
   *
   * @type {string | null}
   */
  let epoch = null
  let stopped = true
  let draining = false
  /** @type {ReturnType<typeof setTimeout> | null} */
  let retryTimer = null
  /** @type {ReturnType<typeof setTimeout> | null} */
  let savingTimer = null

  /** @type {import('@web-interview/todos/types').Connection} */
  let connection = CONNECTION.CONNECTING
  /** @type {string | null} */
  let error = null
  let saving = false

  /**
   * `serverTime - monotonicNow()`. Null until the stream has spoken once, which is
   * why editing is disabled until then: the client has no trustworthy clock and
   * must never read the local one.
   *
   * @type {number | null}
   */
  let clockOffset = null
  let halfRoundTripMs = 0

  const serverNow = () =>
    Math.round(monotonicNow() + /** @type {number} */ (clockOffset))
  const mint = createUlidMinter(serverNow)

  /** @returns {TodoClientStatus} */
  const readStatus = () => ({
    connection,
    pendingCount: outbox.length,
    saving,
    canEdit: clockOffset !== null,
    error,
    epoch,
  })

  let status = readStatus()

  const notify = () => {
    for (const listener of listeners) listener()
  }

  const publish = () => {
    const next = readStatus()
    if (sameStatus(next, status)) return
    status = next
    notify()
  }

  const onSavingDelay = () => {
    savingTimer = null
    if (outbox.length === 0) return
    saving = true
    publish()
  }

  const syncSavingIndicator = () => {
    if (outbox.length > 0) {
      if (!saving && !savingTimer) {
        savingTimer = setTimeout(onSavingDelay, SAVING_INDICATOR_DELAY_MS)
      }
      return
    }
    if (savingTimer) clearTimeout(savingTimer)
    savingTimer = null
    saving = false
  }

  /** @param {number} serverTime */
  const adoptServerTime = (serverTime) => {
    // The reading is half a round trip old by the time it lands here.
    clockOffset = serverTime + halfRoundTripMs - monotonicNow()
  }

  const scheduleRetry = () => {
    if (retryTimer || stopped) return
    retryTimer = setTimeout(() => {
      retryTimer = null
      void drain()
    }, OUTBOX_RETRY_MS)
  }

  const drain = async () => {
    if (draining || stopped || outbox.length === 0) return
    draining = true
    try {
      while (outbox.length > 0 && !stopped) {
        const batch = outbox.slice()
        const sentAt = monotonicNow()
        let response
        try {
          response = await fetchImpl(`${apiBase}${DATOM_API_PATH.ROOT}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ datoms: batch }),
          })
        } catch {
          error = 'Could not reach the server'
          scheduleRetry()
          publish()
          return
        }

        outbox.splice(0, batch.length)
        if (response.ok) {
          halfRoundTripMs = (monotonicNow() - sentAt) / 2
          const body = await response.json().catch(() => ({}))
          if (typeof body.serverTime === 'number') adoptServerTime(body.serverTime)
          error = null
        } else {
          // The server only refuses datoms it will never accept, so retrying one
          // would wedge the outbox behind it forever.
          error = `The server rejected a change (${response.status})`
        }
        syncSavingIndicator()
        publish()
      }
    } finally {
      draining = false
      syncSavingIndicator()
      publish()
    }
  }

  /** @param {import('@web-interview/todos/types').Connection} next */
  const setConnection = (next) => {
    connection = next
    publish()
  }

  const connect = () => {
    if (!EventSourceImpl) {
      error = 'This browser cannot receive live updates'
      setConnection(CONNECTION.FAILED)
      return
    }
    // The first connect of a page load supplies no cursor and wants the whole
    // compacted set. A rebuilt `EventSource` has lost `Last-Event-ID`, so it puts
    // its in-memory cursor in `?since=`.
    const query = cursor ? `?since=${encodeURIComponent(cursor)}` : ''
    const next = new EventSourceImpl(`${apiBase}${DATOM_API_PATH.STREAM}${query}`)
    source = next

    next.onopen = () => {
      error = null
      setConnection(CONNECTION.LIVE)
      void drain()
    }
    next.onmessage = (event) => {
      /** @type {Datom} */
      const datom = JSON.parse(event.data)
      store.apply(datom)
      cursor = event.lastEventId || datom[3]
    }
    next.addEventListener(EPOCH_EVENT, (event) => {
      const received = JSON.parse(/** @type {MessageEvent} */ (event).data).epoch
      if (typeof received !== 'string') return
      if (epoch === null) {
        epoch = received
        publish()
        return
      }
      if (epoch === received) return

      // The server is serving a different log than the one this store was folded
      // from. The cursor is a position, not an identity, so nothing else would
      // ever reveal that the entities held here no longer exist.
      epoch = received
      cursor = undefined
      store.clear()
      publish()
      resync()
    })
    next.addEventListener(CLOCK_EVENT, (event) => {
      const { serverTime } = JSON.parse(/** @type {MessageEvent} */ (event).data)
      if (typeof serverTime !== 'number') return
      adoptServerTime(serverTime)
      publish()
    })
    next.onerror = () => {
      if (stopped) return
      setConnection(
        next.readyState === EVENT_SOURCE_CLOSED
          ? CONNECTION.FAILED
          : CONNECTION.RECONNECTING
      )
    }
  }

  /** Rebuilds the stream from scratch, so it re-requests the whole current set. */
  const resync = () => {
    source?.close()
    source = null
    if (stopped) return
    connect()
  }

  /**
   * @param {string} entity
   * @param {Attribute} attribute
   * @param {FactValue} value
   * @param {boolean} op
   * @returns {Datom | null}
   */
  const write = (entity, attribute, value, op) => {
    if (clockOffset === null) return null
    /** @type {Datom} */
    const datom = [entity, attribute, value, mint.tx(), op]
    store.apply(datom)
    outbox.push(datom)
    syncSavingIndicator()
    publish()
    void drain()
    return datom
  }

  store.subscribe(notify)

  return {
    store,

    /** @param {() => void} listener */
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    getReadModel: () => store.readModel(),
    getStatus: () => status,

    start() {
      if (!stopped) return
      stopped = false
      connect()
    },

    stop() {
      stopped = true
      source?.close()
      source = null
      if (retryTimer) clearTimeout(retryTimer)
      retryTimer = null
      if (savingTimer) clearTimeout(savingTimer)
      savingTimer = null
    },

    reconnect() {
      source?.close()
      source = null
      stopped = false
      setConnection(CONNECTION.CONNECTING)
      connect()
      void drain()
    },

    newListId: () => mint.listId(),
    /** @param {string} listEntity */
    newTodoId: (listEntity) => mint.todoId(listEntity),

    /**
     * @param {string} entity
     * @param {Attribute} attribute
     * @param {FactValue} value
     */
    assert: (entity, attribute, value) => write(entity, attribute, value, true),

    /**
     * A retraction carries the value the client believed it was removing. That
     * value is informational: only `tx` decides which datom wins.
     *
     * @param {string} entity
     * @param {Attribute} attribute
     * @param {FactValue} value
     */
    retract: (entity, attribute, value) => write(entity, attribute, value, false),
  }
}
