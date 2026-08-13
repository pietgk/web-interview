/**
 * Monotonic ULID: a 48-bit millisecond timestamp plus 80 random bits in Crockford
 * base32, so lexicographic order is time order. Two ids minted in the same
 * millisecond keep their mint order because the random component is incremented
 * rather than redrawn.
 *
 * Every entry point takes its milliseconds from the caller. Nothing here reads a
 * clock, so the browser can mint from server time without ever touching
 * `Date.now()`.
 */

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const ENCODING_LENGTH = ENCODING.length
const TIME_LENGTH = 10
const RANDOM_LENGTH = 16
const MAX_TIME = 2 ** 48 - 1

export const ULID_LENGTH = TIME_LENGTH + RANDOM_LENGTH
export const EARLIEST_ULID = '0'.repeat(ULID_LENGTH)

/** Crockford base32 excludes I, L, O and U, so `L` and `T` are unambiguous id prefixes. */
const ULID_SOURCE = `[0-9A-HJKMNP-TV-Z]{${ULID_LENGTH}}`

export const ULID_PATTERN = new RegExp(`^${ULID_SOURCE}$`)
export const TODO_LIST_ID_PATTERN = new RegExp(`^L${ULID_SOURCE}$`)
export const TODO_ID_PATTERN = new RegExp(`^L${ULID_SOURCE}/T${ULID_SOURCE}$`)

const encodeTime = (milliseconds: number) => {
  let remaining = milliseconds
  let encoded = ''
  for (let position = 0; position < TIME_LENGTH; position += 1) {
    const digit = remaining % ENCODING_LENGTH
    encoded = ENCODING[digit] + encoded
    remaining = (remaining - digit) / ENCODING_LENGTH
  }
  return encoded
}

const randomBase32 = () => {
  const bytes = new Uint8Array(RANDOM_LENGTH)
  globalThis.crypto.getRandomValues(bytes)
  let encoded = ''
  // 256 is a multiple of 32, so the modulo is unbiased.
  for (const byte of bytes) encoded += ENCODING[byte % ENCODING_LENGTH]
  return encoded
}

/**
 * Carries a base32 string by one. The overflow throw at the end needs all 80
 * random bits already at maximum within a single millisecond, which no test can
 * arrange without replacing the generator with one that is no longer the thing
 * under test, so it is marked unreachable rather than chased.
 */
const incrementBase32 = (encoded: string) => {
  for (let position = encoded.length - 1; position >= 0; position -= 1) {
    const digit = ENCODING.indexOf(encoded[position])
    if (digit === ENCODING_LENGTH - 1) {
      encoded = `${encoded.slice(0, position)}${ENCODING[0]}${encoded.slice(position + 1)}`
      continue
    }
    return `${encoded.slice(0, position)}${ENCODING[digit + 1]}${encoded.slice(position + 1)}`
  }
  /* v8 ignore next */
  throw new Error('ULID random component overflowed within one millisecond')
}

let lastTime = -1
let lastRandom = ''

export const ulid = (milliseconds: number): string => {
  if (!Number.isInteger(milliseconds) || milliseconds < 0 || milliseconds > MAX_TIME) {
    throw new RangeError('ULID time must be a whole number of milliseconds within 48 bits')
  }
  if (milliseconds <= lastTime) {
    // A repeated or backwards clock keeps the previous timestamp so the id stays monotonic.
    lastRandom = incrementBase32(lastRandom)
  } else {
    lastTime = milliseconds
    lastRandom = randomBase32()
  }
  return encodeTime(lastTime) + lastRandom
}

/** `id` is a bare 26-character ULID. @returns the millisecond the id was minted */
export const ulidTime = (id: string): number => {
  if (!ULID_PATTERN.test(id)) throw new TypeError(`Not a ULID: ${id}`)
  let milliseconds = 0
  for (const character of id.slice(0, TIME_LENGTH)) {
    milliseconds = milliseconds * ENCODING_LENGTH + ENCODING.indexOf(character)
  }
  return milliseconds
}

export const listId = (milliseconds: number): string => `L${ulid(milliseconds)}`

/**
 * A Todo carries its Todo List in its id, so a Todo belonging to no Todo List is
 * unrepresentable rather than merely unlikely.
 */
export const todoId = (listEntity: string, milliseconds: number): string =>
  `${listEntity}/T${ulid(milliseconds)}`

/**
 * Binds the generator to a clock. The browser passes its server-time source, so
 * ids and `tx` values are minted from the same trustworthy clock.
 */
export const createUlidMinter = (now: () => number) => ({
  tx: () => ulid(now()),
  listId: () => listId(now()),
  todoId: (listEntity: string) => todoId(listEntity, now()),
})
