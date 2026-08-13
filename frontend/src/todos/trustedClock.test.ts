import { ulidTime } from '@web-interview/todos/ulid'
import { createTrustedClock } from './trustedClock.ts'

const SERVER_TIME = new Date(2028, 6, 31, 23, 59, 59).getTime()
const SERVER_DAY = '2028-07-31'
const NEXT_SERVER_DAY = '2028-08-01'
const ONE_SECOND_MS = 1_000
const ROUND_TRIP_MS = 200
const HALF_ROUND_TRIP_MS = ROUND_TRIP_MS / 2

describe('createTrustedClock', () => {
  it('owns trusted time, identifier minting, and midnight subscriptions', async () => {
    vi.useFakeTimers()
    try {
      let elapsed = 0
      const clock = createTrustedClock({ monotonicNow: () => elapsed })
      let notifications = 0
      clock.subscribeToday(() => { notifications += 1 })

      expect(clock.getSnapshot()).toEqual({ trusted: false, today: null })

      clock.adopt(SERVER_TIME)
      expect(clock.getSnapshot()).toEqual({ trusted: true, today: SERVER_DAY })
      expect(ulidTime(clock.mint.listId().slice(1))).toBe(SERVER_TIME)
      expect(notifications).toBe(1)

      elapsed += ONE_SECOND_MS
      await vi.advanceTimersByTimeAsync(ONE_SECOND_MS)
      expect(clock.getSnapshot().today).toBe(NEXT_SERVER_DAY)
      expect(notifications).toBe(2)

      clock.stop()
      elapsed += ONE_SECOND_MS
      await vi.advanceTimersByTimeAsync(ONE_SECOND_MS)
      expect(notifications).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('accounts for half of the latest measured round trip when adopting server time', () => {
    let elapsed = 0
    const clock = createTrustedClock({ monotonicNow: () => elapsed })
    elapsed = ROUND_TRIP_MS

    clock.adopt(SERVER_TIME, ROUND_TRIP_MS)

    expect(ulidTime(clock.mint.tx())).toBe(SERVER_TIME + HALF_ROUND_TRIP_MS)
    clock.stop()
  })

  it('supports its default monotonic clock and removes today subscriptions', () => {
    const clock = createTrustedClock()
    let notifications = 0
    const unsubscribe = clock.subscribeToday(() => { notifications += 1 })
    unsubscribe()

    clock.adopt(SERVER_TIME)

    expect(clock.getSnapshot()).toEqual({ trusted: true, today: SERVER_DAY })
    expect(notifications).toBe(0)
    clock.stop()
  })
})
