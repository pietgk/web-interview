export const TODO_TEXT_MAX_LENGTH = 1000
export const TODO_LIST_TITLE_MAX_LENGTH = 100

/**
 * A past-dated `tx` is harmless because it loses. A future-dated one wins every
 * conflict until wall time catches up, so the server refuses it.
 */
export const TX_FUTURE_TOLERANCE_MS = 5_000

/** A text field settles after this much idle time, or on blur or Enter. */
export const TEXT_SETTLE_MS = 500

/**
 * Settle-grained minting followed by an immediate POST empties the outbox in
 * roughly 50ms, so an undelayed indicator would flicker on every edit.
 */
export const SAVING_INDICATOR_DELAY_MS = 300

/** Carries server time and keeps the stream open through proxies. */
export const HEARTBEAT_INTERVAL_MS = 15_000

export const DATOM_API_PATH = Object.freeze({
  ROOT: '/api/datoms',
  STREAM: '/api/datoms/stream',
})

export const CLOCK_EVENT = 'clock'

export const ERROR_CODE = Object.freeze({
  INTERNAL: 'INTERNAL_ERROR',
  INVALID_DATOM: 'INVALID_DATOM',
  MALFORMED_JSON: 'MALFORMED_JSON',
  NETWORK: 'NETWORK_ERROR',
  VALIDATION: 'VALIDATION_ERROR',
})

export const CONNECTION = Object.freeze({
  CONNECTING: 'connecting',
  LIVE: 'live',
  RECONNECTING: 'reconnecting',
  FAILED: 'failed',
})
