import { describe, it } from 'vitest'
import assert from 'node:assert/strict'
import {
  ATTRIBUTE,
  ENTITY_TYPE,
  datomSchema,
  entityTypeOf,
  listEntityOf,
} from './datom.js'
import {
  TODO_LIST_TITLE_MAX_LENGTH,
  TODO_TEXT_MAX_LENGTH,
} from './todoProtocol.js'
import { listId, todoId, ulid } from './ulid.js'

let clock = 1_760_000_000_000
const at = () => (clock += 1)

const LIST = listId(at())
const TODO = todoId(LIST, at())
const TX = ulid(at())

/** @param {unknown} datom */
const parse = (datom) => datomSchema.safeParse(datom)

/** @param {unknown} datom */
const firstIssue = (datom) => {
  const result = parse(datom)
  assert.equal(result.success, false, `expected ${JSON.stringify(datom)} to be rejected`)
  return result.error.issues[0]
}

describe('datom', () => {
  it('accepts the four attributes on their own entity type', () => {
    assert.equal(parse([LIST, ATTRIBUTE.TITLE, 'Release', TX, true]).success, true)
    assert.equal(parse([TODO, ATTRIBUTE.TEXT, 'Ship it', TX, true]).success, true)
    assert.equal(parse([TODO, ATTRIBUTE.COMPLETED, true, TX, true]).success, true)
    assert.equal(parse([TODO, ATTRIBUTE.DUE_DATE, '2026-08-03', TX, true]).success, true)
  })

  it('rejects an unknown attribute rather than ignoring it', () => {
    assert.equal(parse([LIST, 'list/order', 1, TX, true]).success, false)
    assert.equal(parse([TODO, 'todo/deleted', true, TX, true]).success, false)
  })

  it('rejects title on a Todo id and text on a Todo List id', () => {
    assert.equal(firstIssue([TODO, ATTRIBUTE.TITLE, 'Release', TX, true]).path[0], 1)
    assert.equal(firstIssue([LIST, ATTRIBUTE.TEXT, 'Ship it', TX, true]).path[0], 1)
  })

  it('rejects an entity id that is neither a Todo List nor a Todo', () => {
    assert.equal(firstIssue(['0000000001', ATTRIBUTE.TITLE, 'Release', TX, true]).path[0], 0)
    assert.equal(firstIssue([`${LIST}/T-nope`, ATTRIBUTE.TEXT, 'x', TX, true]).path[0], 0)
  })

  it('rejects a retraction that carries no value', () => {
    assert.equal(parse([LIST, ATTRIBUTE.TITLE, null, TX, false]).success, false)
    assert.equal(parse([LIST, ATTRIBUTE.TITLE, TX, false]).success, false)
  })

  it('rejects a title that is empty after trimming, and one over the limit', () => {
    const longest = 'x'.repeat(TODO_LIST_TITLE_MAX_LENGTH)

    assert.equal(parse([LIST, ATTRIBUTE.TITLE, '   ', TX, true]).success, false)
    assert.equal(parse([LIST, ATTRIBUTE.TITLE, `  ${longest}  `, TX, true]).success, true)
    assert.equal(parse([LIST, ATTRIBUTE.TITLE, `${longest}x`, TX, true]).success, false)
  })

  it('accepts Todo text at the shared limit and rejects one character more', () => {
    assert.equal(
      parse([TODO, ATTRIBUTE.TEXT, 'x'.repeat(TODO_TEXT_MAX_LENGTH), TX, true]).success,
      true
    )
    assert.equal(
      parse([TODO, ATTRIBUTE.TEXT, 'x'.repeat(TODO_TEXT_MAX_LENGTH + 1), TX, true]).success,
      false
    )
  })

  it('rejects a dueDate that is not a real calendar date', () => {
    assert.equal(parse([TODO, ATTRIBUTE.DUE_DATE, '2026-02-29', TX, true]).success, false)
    assert.equal(parse([TODO, ATTRIBUTE.DUE_DATE, '2024-02-29', TX, true]).success, true)
  })

  it('rejects a tx that is not a ULID', () => {
    assert.equal(parse([LIST, ATTRIBUTE.TITLE, 'Release', 'tx-genesis', true]).success, false)
  })

  it('reads the Todo List of a Todo off its id', () => {
    assert.equal(entityTypeOf(LIST), ENTITY_TYPE.TODO_LIST)
    assert.equal(entityTypeOf(TODO), ENTITY_TYPE.TODO)
    assert.equal(entityTypeOf('nonsense'), null)
    assert.equal(listEntityOf(TODO), LIST)
  })
})
