import { DatomStore } from '@web-interview/todos/datom-store'
import {
  apiErrorBodySchema,
  BROWSER_ERROR_CODE,
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
  left.rehydrating === right.rehydrating &&
  left.failure === right.failure &&
  left.epoch === right.epoch

/** @param {string} message */
const networkFailure = (message) => ({
  kind: /** @type {const} */ ('network'),
  status: null,
  code: BROWSER_ERROR_CODE.NETWORK_ERROR,
  message,
  issues: /** @type {[]} */ ([]),
})

/** @param {number | null} status */
const invalidResponseFailure = (status) => ({
  kind: /** @type {const} */ ('invalid-response'),
  status,
  code: BROWSER_ERROR_CODE.INVALID_RESPONSE,
  message: 'The server returned an invalid response',
  issues: /** @type {[]} */ ([]),
})

/** @param {Response} response */
const failureFromResponse = async (response) => {
  const body = await response.json().catch(() => null)
  const parsed = apiErrorBodySchema.safeParse(body)
  if (!parsed.success) return invalidResponseFailure(response.status)
  return {
    kind: /** @type {const} */ ('api'),
    status: response.status,
    code: parsed.data.code,
    message: parsed.data.error,
    issues: parsed.data.issues ?? [],
  }
}

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
  /** @type {Set<() => void>} */
  const todayListeners = new Set()

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
  let rehydrating = false
  /** @type {ReturnType<typeof setTimeout> | null} */
  let retryTimer = null
  /** @type {ReturnType<typeof setTimeout> | null} */
  let savingTimer = null
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let todayTimer

  /** @type {import('@web-interview/todos/types').Connection} */
  let connection = CONNECTION.CONNECTING
  /** @type {import('@web-interview/todos/types').DeliveryFailure | null} */
  let failure = null
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
  /** @type {string | null} */
  let today = null

  const serverNow = () =>
    Math.round(monotonicNow() + /** @type {number} */ (clockOffset))
  const mint = createUlidMinter(serverNow)

  /** @returns {TodoClientStatus} */
  const readStatus = () => ({
    connection,
    pendingCount: outbox.length,
    saving,
    canEdit: clockOffset !== null && !rehydrating,
    rehydrating,
    failure,
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
    // Unreachable: both outbox mutations are followed synchronously by
    // `syncSavingIndicator`, which clears this timer whenever the outbox is
    // empty, so it cannot fire with nothing to save. Kept because the guard is
    // local and the invariant it leans on is not.
    /* v8 ignore next */
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

  /** @param {number} time */
  const localCalendarDate = (time) => {
    const date = new Date(time)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const scheduleToday = () => {
    clearTimeout(todayTimer)
    const now = serverNow()
    const date = new Date(now)
    const nextMidnight = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate() + 1
    ).getTime()
    todayTimer = setTimeout(syncToday, Math.max(1, nextMidnight - now))
  }

  const syncToday = () => {
    todayTimer = undefined
    const next = localCalendarDate(serverNow())
    if (next !== today) {
      today = next
      for (const listener of todayListeners) listener()
    }
    scheduleToday()
  }

  /** @param {number} serverTime */
  const adoptServerTime = (serverTime) => {
    // The reading is half a round trip old by the time it lands here.
    clockOffset = serverTime + halfRoundTripMs - monotonicNow()
    syncToday()
  }

  const scheduleRetry = () => {
    if (retryTimer || stopped) return
    retryTimer = setTimeout(() => {
      retryTimer = null
      void drain()
    }, OUTBOX_RETRY_MS)
  }

  const beginRehydration = () => {
    // The rejected prefix has already left the outbox. Disable editing before
    // clearing optimistic state, then request the complete authoritative set.
    // The snapshot's trailing clock reapplies only the later outbox suffix.
    rehydrating = true
    cursor = undefined
    publish()
    store.clear()
    resync()
  }

  const drain = async () => {
    if (draining || rehydrating || stopped || outbox.length === 0) return
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
          failure = networkFailure('Could not reach the server')
          scheduleRetry()
          publish()
          return
        }

        if (response.ok) {
          outbox.splice(0, batch.length)
          halfRoundTripMs = (monotonicNow() - sentAt) / 2
          const body = await response.json().catch(() => null)
          if (typeof body?.serverTime !== 'number') {
            failure = invalidResponseFailure(response.status)
            beginRehydration()
            return
          }
          adoptServerTime(body.serverTime)
          failure = null
        } else {
          // The server only refuses datoms it will never accept, so retrying one
          // would wedge the outbox behind it forever.
          outbox.splice(0, batch.length)
          failure = await failureFromResponse(response)
          beginRehydration()
          return
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
      failure = networkFailure('This browser cannot receive live updates')
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
      if (rehydrating) {
        for (const datom of outbox) store.apply(datom)
        rehydrating = false
        void drain()
      }
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
    if (clockOffset === null || rehydrating) return null
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

    /** @param {() => void} listener */
    subscribeToday(listener) {
      todayListeners.add(listener)
      return () => todayListeners.delete(listener)
    },

    getReadModel: () => store.readModel(),
    getStatus: () => status,
    getToday: () => today,

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
      clearTimeout(todayTimer)
      todayTimer = undefined
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
     * Write dAtom asserting a fact
     *
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
