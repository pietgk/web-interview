import { describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { ATTRIBUTE } from './datom.ts'
import { DatomStore } from './datomStore.ts'
import { listId, todoId, ulid } from './ulid.ts'
import type { Attribute, Datom, FactValue } from './types.ts'

const INITIAL_STORE_TIME_MS = 1_770_000_000_000
const STORED_DUE_DAY = '2026-08-03'

let clock = INITIAL_STORE_TIME_MS
const nextTimestamp = () => (clock += 1)

/** Mints in ascending `tx` order unless a test deliberately reorders. */
const tx = () => ulid(nextTimestamp())

const datom = (
  entity: string,
  attribute: Attribute,
  value: FactValue,
  transaction: string,
  op = true
): Datom => [
  entity,
  attribute,
  value,
  transaction,
  op,
]

const seededStore = () => {
  const store = new DatomStore()
  const list = listId(nextTimestamp())
  const todo = todoId(list, nextTimestamp())
  store.apply(datom(list, ATTRIBUTE.TITLE, 'Release', tx()))
  store.apply(datom(todo, ATTRIBUTE.TEXT, 'Ship it', tx()))
  return { store, list, todo }
}

describe('DatomStore', () => {
  it('lets a higher tx overwrite a lower one for the same entity and attribute', () => {
    const { store, list } = seededStore()

    assert.equal(store.apply(datom(list, ATTRIBUTE.TITLE, 'Renamed', tx())), true)
    assert.equal(store.readModel()[list]?.title, 'Renamed')
  })

  it('does not let a lower tx arriving later overwrite the winner', () => {
    const { store, list } = seededStore()
    const stale = tx()
    const winner = tx()

    store.apply(datom(list, ATTRIBUTE.TITLE, 'Winner', winner))
    assert.equal(store.apply(datom(list, ATTRIBUTE.TITLE, 'Stale', stale)), false)
    assert.equal(store.readModel()[list]?.title, 'Winner')
  })

  it('reports that an identical re-delivered datom did not win', () => {
    const { store, list } = seededStore()
    const rename = datom(list, ATTRIBUTE.TITLE, 'Renamed', tx())

    assert.equal(store.apply(rename), true)
    const afterFirst = store.readModel()
    assert.equal(store.apply(rename), false)
    assert.equal(store.readModel(), afterFirst)
  })

  it('makes an entity exist only while its defining attribute is asserted', () => {
    const { store, list } = seededStore()

    assert.ok(store.readModel()[list])
    store.apply(datom(list, ATTRIBUTE.TITLE, 'Release', tx(), false))
    assert.deepEqual(store.readModel(), {})
  })

  it('hides an entity and its other attributes when the defining attribute is retracted', () => {
    const { store, list, todo } = seededStore()
    store.apply(datom(todo, ATTRIBUTE.COMPLETED, true, tx()))
    store.apply(datom(todo, ATTRIBUTE.DUE_DATE, STORED_DUE_DAY, tx()))

    store.apply(datom(todo, ATTRIBUTE.TEXT, 'Ship it', tx(), false))

    assert.deepEqual(store.readModel()[list]?.todos, [])
  })

  it('restores completed and dueDate when a defining attribute is re-asserted', () => {
    const { store, list, todo } = seededStore()
    store.apply(datom(todo, ATTRIBUTE.COMPLETED, true, tx()))
    store.apply(datom(todo, ATTRIBUTE.DUE_DATE, STORED_DUE_DAY, tx()))
    store.apply(datom(todo, ATTRIBUTE.TEXT, 'Ship it', tx(), false))

    store.apply(datom(todo, ATTRIBUTE.TEXT, 'Ship it', tx()))

    assert.deepEqual(store.readModel()[list]?.todos, [
      { id: todo, text: 'Ship it', completed: true, dueDate: STORED_DUE_DAY },
    ])
  })

  it('does not project a Todo whose Todo List does not exist', () => {
    const store = new DatomStore()
    const absentList = listId(nextTimestamp())
    store.apply(datom(todoId(absentList, nextTimestamp()), ATTRIBUTE.TEXT, 'Orphan', tx()))

    assert.deepEqual(store.readModel(), {})
  })

  it('sorts Todos by id descending and Todo Lists by id ascending', () => {
    const store = new DatomStore()
    const first = listId(nextTimestamp())
    const second = listId(nextTimestamp())
    const older = todoId(first, nextTimestamp())
    const newer = todoId(first, nextTimestamp())
    store.apply(datom(second, ATTRIBUTE.TITLE, 'Second', tx()))
    store.apply(datom(first, ATTRIBUTE.TITLE, 'First', tx()))
    store.apply(datom(older, ATTRIBUTE.TEXT, 'Older', tx()))
    store.apply(datom(newer, ATTRIBUTE.TEXT, 'Newer', tx()))

    const readModel = store.readModel()
    assert.deepEqual(Object.keys(readModel), [first, second])
    assert.deepEqual(
      readModel[first]?.todos.map((todo) => todo.text),
      ['Newer', 'Older']
    )
  })

  it('does not move a Todo when it is renamed', () => {
    const store = new DatomStore()
    const list = listId(nextTimestamp())
    const older = todoId(list, nextTimestamp())
    const newer = todoId(list, nextTimestamp())
    store.apply(datom(list, ATTRIBUTE.TITLE, 'Release', tx()))
    store.apply(datom(older, ATTRIBUTE.TEXT, 'Older', tx()))
    store.apply(datom(newer, ATTRIBUTE.TEXT, 'Newer', tx()))

    store.apply(datom(older, ATTRIBUTE.TEXT, 'Older, renamed', tx()))

    assert.deepEqual(
      store.readModel()[list]?.todos.map((todo) => todo.text),
      ['Newer', 'Older, renamed']
    )
  })

  it('returns the same readModel reference until a datom wins', () => {
    const { store, list } = seededStore()
    const before = store.readModel()

    assert.equal(store.readModel(), before)
    store.apply(datom(list, ATTRIBUTE.TITLE, 'Renamed', tx()))
    assert.notEqual(store.readModel(), before)
  })

  it('replays datomsSince into an identical read model', () => {
    const { store, list, todo } = seededStore()
    store.apply(datom(todo, ATTRIBUTE.COMPLETED, true, tx()))
    store.apply(datom(list, ATTRIBUTE.TITLE, 'Renamed', tx()))

    const replica = new DatomStore()
    for (const winner of store.datomsSince()) replica.apply(winner)

    assert.deepEqual(replica.readModel(), store.readModel())
  })

  it('retains a retraction so a client that was away learns of the deletion', () => {
    const { store, todo } = seededStore()
    const cursor = store.datomsSince().at(-1)?.[3]
    store.apply(datom(todo, ATTRIBUTE.TEXT, 'Ship it', tx(), false))

    const streamed = store.datomsSince(cursor)
    const [first] = streamed
    assert.ok(first)
    assert.deepEqual(streamed, [
      datom(todo, ATTRIBUTE.TEXT, 'Ship it', first[3], false),
    ])
  })

  it('never streams a superseded datom, and streams in ascending tx order', () => {
    const { store, list } = seededStore()
    store.apply(datom(list, ATTRIBUTE.TITLE, 'Renamed', tx()))

    const datoms = store.datomsSince()
    assert.deepEqual(
      datoms.map(([, , value]) => value),
      ['Ship it', 'Renamed']
    )
    assert.deepEqual(
      datoms.map(([, , , transaction]) => transaction),
      [...datoms.map(([, , , transaction]) => transaction)].sort()
    )
  })

  it('forgets everything when cleared, so a replaced log cannot be folded onto an old one', () => {
    const { store, list } = seededStore()
    let notifications = 0
    store.subscribe(() => (notifications += 1))

    assert.equal(store.clear(), true)
    assert.deepEqual(store.readModel(), {})
    assert.deepEqual(store.datomsSince(), [])
    assert.equal(notifications, 1)

    assert.equal(store.clear(), false, 'an empty store has nothing to forget')
    assert.equal(notifications, 1)

    // A datom that lost against the cleared state applies again from scratch.
    assert.equal(store.apply(datom(list, ATTRIBUTE.TITLE, 'Fresh log', tx())), true)
    assert.equal(store.readModel()[list]?.title, 'Fresh log')
  })

  it('notifies subscribers only for winning datoms', () => {
    const { store, list } = seededStore()
    let notifications = 0
    const subscription = store.subscribe(() => (notifications += 1))
    const winner = datom(list, ATTRIBUTE.TITLE, 'Renamed', tx())

    store.apply(winner)
    store.apply(winner)
    assert.equal(notifications, 1)

    subscription.unsubscribe()
    store.apply(datom(list, ATTRIBUTE.TITLE, 'Again', tx()))
    assert.equal(notifications, 1)
  })
})
