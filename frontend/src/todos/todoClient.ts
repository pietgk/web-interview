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
import type {
  Attribute,
  Connection,
  Datom,
  DeliveryFailure,
  FactValue,
  TodoClientStatus,
} from '@web-interview/todos/types'
import { createTrustedClock } from './trustedClock.ts'

const DEFAULT_API_BASE = (import.meta.env['VITE_API_BASE'] ?? '').replace(/\/$/, '')
const OUTBOX_RETRY_MS = 1_000
const EVENT_SOURCE_CLOSED = 2

const sameStatus = (left: TodoClientStatus, right: TodoClientStatus) =>
  left.connection === right.connection &&
  left.pendingCount === right.pendingCount &&
  left.saving === right.saving &&
  left.canEdit === right.canEdit &&
  left.rehydrating === right.rehydrating &&
  left.failure === right.failure &&
  left.epoch === right.epoch

const networkFailure = (message: string) => ({
  kind: 'network' as const,
  status: null,
  code: BROWSER_ERROR_CODE.NETWORK_ERROR,
  message,
  issues: [] as [],
})

const invalidResponseFailure = (status: number | null) => ({
  kind: 'invalid-response' as const,
  status,
  code: BROWSER_ERROR_CODE.INVALID_RESPONSE,
  message: 'The server returned an invalid response',
  issues: [] as [],
})

const failureFromResponse = async (response: Response) => {
  const body = await response.json().catch(() => null)
  const parsed = apiErrorBodySchema.safeParse(body)
  if (!parsed.success) return invalidResponseFailure(response.status)
  return {
    kind: 'api' as const,
    status: response.status,
    code: parsed.data.code,
    message: parsed.data.error,
    issues: parsed.data.issues ?? [],
  }
}

/**
 * The browser half of the log: a `DatomStore`, an `EventSource` reading it down,
 * an outbox POSTing it up, and a server-time source. It persists nothing.
 */
export const createTodoClient = ({
  apiBase = DEFAULT_API_BASE,
  EventSourceImpl = globalThis.EventSource,
  fetchImpl = (...args) => globalThis.fetch(...args),
  monotonicNow = () => performance.now(),
}: {
  apiBase?: string
  EventSourceImpl?: typeof EventSource
  fetchImpl?: typeof fetch
  monotonicNow?: () => number
} = {}) => {
  const store = new DatomStore()
  const outbox: Datom[] = []
  const listeners: Set<() => void> = new Set()
  const clock = createTrustedClock({ monotonicNow })

  let source: EventSource | null = null
  let cursor: string | undefined
  /**
   * Which log the datoms in the store came from. Null until the stream says.
   */
  let epoch: string | null = null
  let stopped = true
  let draining = false
  let rehydrating = false
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let savingTimer: ReturnType<typeof setTimeout> | null = null
  let connection: Connection = CONNECTION.CONNECTING
  let failure: DeliveryFailure | null = null
  let saving = false

  const readStatus = (): TodoClientStatus => ({
    connection,
    pendingCount: outbox.length,
    saving,
    canEdit: clock.getSnapshot().trusted && !rehydrating,
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
          const body = await response.json().catch(() => null)
          if (typeof body?.serverTime !== 'number') {
            failure = invalidResponseFailure(response.status)
            beginRehydration()
            return
          }
          clock.adopt(body.serverTime, monotonicNow() - sentAt)
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

  const setConnection = (next: Connection) => {
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
      const datom: Datom = JSON.parse(event.data)
      store.apply(datom)
      cursor = event.lastEventId || datom[3]
    }
    next.addEventListener(EPOCH_EVENT, (event) => {
      const received = JSON.parse((event as MessageEvent).data).epoch
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
      const { serverTime } = JSON.parse((event as MessageEvent).data)
      if (typeof serverTime !== 'number') return
      clock.adopt(serverTime)
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

  const write = (entity: string, attribute: Attribute, value: FactValue, op: boolean): Datom | null => {
    if (!clock.getSnapshot().trusted || rehydrating) return null
    const datom: Datom = [entity, attribute, value, clock.mint.tx(), op]
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

    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    subscribeToday(listener: () => void) {
      return clock.subscribeToday(listener)
    },

    getReadModel: () => store.readModel(),
    getStatus: () => status,
    getToday: () => clock.getSnapshot().today,

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
      clock.stop()
    },

    reconnect() {
      source?.close()
      source = null
      stopped = false
      setConnection(CONNECTION.CONNECTING)
      connect()
      void drain()
    },

    newListId: () => clock.mint.listId(),
    newTodoId: (listEntity: string) => clock.mint.todoId(listEntity),

    /**
     * Write dAtom asserting a fact
     */
    assert: (entity: string, attribute: Attribute, value: FactValue) => write(entity, attribute, value, true),

    /**
     * A retraction carries the value the client believed it was removing. That
     * value is informational: only `tx` decides which datom wins.
     */
    retract: (entity: string, attribute: Attribute, value: FactValue) => write(entity, attribute, value, false),
  }
}
