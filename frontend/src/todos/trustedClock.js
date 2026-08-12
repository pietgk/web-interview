import { createUlidMinter } from '@web-interview/todos/ulid'

const ROUND_TRIP_HALVES = 2
const NEXT_CALENDAR_DAY_OFFSET = 1
const MINIMUM_TIMER_DELAY_MS = 1

/**
 * Owns the browser's trusted server-time projection, calendar day, midnight
 * timer, and every identifier minted from that clock.
 *
 * @param {object} [options]
 * @param {() => number} [options.monotonicNow]
 */
export const createTrustedClock = ({
  monotonicNow = () => performance.now(),
} = {}) => {
  /** @type {number | null} */
  let offset = null
  let halfRoundTripMs = 0
  /** @type {string | null} */
  let today = null
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let todayTimer
  /** @type {Set<() => void>} */
  const todayListeners = new Set()

  const serverNow = () =>
    Math.round(monotonicNow() + /** @type {number} */ (offset))
  const mint = createUlidMinter(serverNow)

  /** @param {number} time */
  const localCalendarDate = (time) => {
    const date = new Date(time)
    const year = date.getFullYear()
    const month = String(date.getMonth() + NEXT_CALENDAR_DAY_OFFSET).padStart(2, '0')
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
      date.getDate() + NEXT_CALENDAR_DAY_OFFSET
    ).getTime()
    todayTimer = setTimeout(syncToday, Math.max(MINIMUM_TIMER_DELAY_MS, nextMidnight - now))
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

  return {
    mint,

    /** @param {number} serverTime @param {number} [roundTripMs] */
    adopt(serverTime, roundTripMs) {
      if (roundTripMs !== undefined) halfRoundTripMs = roundTripMs / ROUND_TRIP_HALVES
      offset = serverTime + halfRoundTripMs - monotonicNow()
      syncToday()
    },

    getSnapshot: () => ({ trusted: offset !== null, today }),

    /** @param {() => void} listener */
    subscribeToday(listener) {
      todayListeners.add(listener)
      return () => todayListeners.delete(listener)
    },

    stop() {
      clearTimeout(todayTimer)
      todayTimer = undefined
    },
  }
}
