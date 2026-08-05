import { describe, it } from 'vitest'
import assert from 'node:assert/strict'
import {
  createUlidMinter,
  listId,
  todoId,
  ulid,
  ulidTime,
} from './ulid.js'

// The generator is monotonic across the whole process, so every test mints from a
// later millisecond than the one before it.
let clock = 1_700_000_000_000
const nextMillisecond = () => (clock += 1_000)

describe('ULID', () => {
  it('sorts two ids minted in the same millisecond in mint order', () => {
    const sameMillisecond = nextMillisecond()
    const ids = Array.from({ length: 50 }, () => ulid(sameMillisecond))

    assert.deepEqual(ids, [...ids].sort())
    assert.equal(new Set(ids).size, ids.length)
  })

  it('makes lexicographic order equal time order across milliseconds', () => {
    const earlier = ulid(nextMillisecond())
    const later = ulid(nextMillisecond())
    const muchLater = ulid(nextMillisecond() + 10_000_000)

    assert.ok(earlier < later)
    assert.ok(later < muchLater)
    clock += 10_000_000
  })

  it('stays monotonic when the clock moves backwards', () => {
    const first = ulid(nextMillisecond())
    const afterRewind = ulid(clock - 400)

    assert.ok(first < afterRewind)
  })

  it('decodes the first 10 characters back to the mint time', () => {
    const mintedAt = nextMillisecond()

    assert.equal(ulidTime(ulid(mintedAt)), mintedAt)
  })

  it('rejects a time that is not whole milliseconds within 48 bits', () => {
    assert.throws(() => ulid(1.5), RangeError)
    assert.throws(() => ulid(-1), RangeError)
    assert.throws(() => ulid(2 ** 48), RangeError)
  })

  it('rejects decoding anything that is not a bare ULID', () => {
    assert.throws(() => ulidTime(listId(nextMillisecond())), TypeError)
  })

  it('shapes Todo List and Todo ids so a Todo names its Todo List', () => {
    const list = listId(nextMillisecond())
    const todo = todoId(list, nextMillisecond())

    assert.match(list, /^L[0-9A-HJKMNP-TV-Z]{26}$/)
    assert.match(todo, /^L[0-9A-HJKMNP-TV-Z]{26}\/T[0-9A-HJKMNP-TV-Z]{26}$/)
    assert.ok(todo.startsWith(`${list}/T`))
  })

  it('mints from an injected clock rather than the local one', () => {
    let serverTime = nextMillisecond()
    const mint = createUlidMinter(() => serverTime)

    const first = mint.tx()
    serverTime += 5_000
    const second = mint.tx()
    clock = serverTime

    assert.equal(ulidTime(first), serverTime - 5_000)
    assert.equal(ulidTime(second), serverTime)
  })
})
