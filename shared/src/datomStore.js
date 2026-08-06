import {
  ATTRIBUTE,
  ENTITY_TYPE,
  entityTypeOf,
  listEntityOf,
} from './datom.js'

/** @typedef {import('./types.js').Attribute} Attribute */
/** @typedef {import('./types.js').Datom} Datom */
/** @typedef {import('./types.js').Fact} Fact */
/** @typedef {import('./types.js').Todo} Todo */
/** @typedef {import('./types.js').TodoList} TodoList */
/** @typedef {import('./types.js').TodoLists} TodoLists */

/** @param {string} left @param {string} right */
const ascending = (left, right) => (left < right ? -1 : left > right ? 1 : 0)

/**
 * The fold both sides run verbatim: an append-only log of single datoms projected
 * by last-write-wins. `apply` is a comparison and an assignment, so re-delivering
 * a datom is an exact no-op and needs no idempotency bookkeeping.
 */
export class DatomStore {
  /** @type {Map<string, Map<Attribute, Fact>>} */
  #facts = new Map()

  /** @type {TodoLists | null} */
  #readModel = null

  /** @type {Set<() => void>} */
  #listeners = new Set()

  /**
   * @param {Datom} datom
   * @returns {boolean} whether the datom won on `tx`
   */
  apply([entity, attribute, value, tx, op]) {
    let attributes = this.#facts.get(entity)
    const current = attributes?.get(attribute)
    if (current && current.tx >= tx) return false

    if (!attributes) {
      attributes = new Map()
      this.#facts.set(entity, attributes)
    }
    attributes.set(attribute, { v: value, tx, op })
    this.#readModel = null
    for (const listener of this.#listeners) listener()
    return true
  }

  /**
   * The currently winning datoms newer than `tx`, in ascending `tx` order so a
   * consuming cursor advances monotonically. Retractions are included: a client
   * that was away learns of a deletion only from its tombstone.
   *
   * @param {string} [tx] every winning datom when omitted
   * @returns {Datom[]}
   */
  datomsSince(tx) {
    /** @type {Datom[]} */
    const datoms = []
    for (const [entity, attributes] of this.#facts) {
      for (const [attribute, fact] of attributes) {
        if (tx !== undefined && fact.tx <= tx) continue
        datoms.push([entity, attribute, fact.v, fact.tx, fact.op])
      }
    }
    return datoms.sort((left, right) => ascending(left[3], right[3]))
  }

  /**
   * Forgets everything. Only for a client that has learned its server's log was
   * replaced: a cursor names a position in a log, never which log, so the datoms
   * already folded in here can no longer be reconciled with what arrives next.
   *
   * @returns {boolean} whether there was anything to forget
   */
  clear() {
    if (this.#facts.size === 0) return false
    this.#facts.clear()
    this.#readModel = null
    for (const listener of this.#listeners) listener()
    return true
  }

  /**
   * Memoized because `useSyncExternalStore` requires a referentially stable
   * snapshot; the memo is dropped whenever a datom wins.
   *
   * @returns {TodoLists}
   */
  readModel() {
    if (!this.#readModel) this.#readModel = this.#project()
    return this.#readModel
  }

  /** @param {() => void} listener */
  subscribe(listener) {
    this.#listeners.add(listener)
    return { unsubscribe: () => this.#listeners.delete(listener) }
  }

  /** @returns {TodoLists} */
  #project() {
    /** @type {TodoList[]} */
    const lists = []
    for (const [entity, attributes] of this.#facts) {
      if (entityTypeOf(entity) !== ENTITY_TYPE.TODO_LIST) continue
      const title = attributes.get(ATTRIBUTE.TITLE)
      if (!title?.op) continue
      lists.push({ id: entity, title: /** @type {string} */ (title.v), todos: [] })
    }
    lists.sort((left, right) => ascending(left.id, right.id))

    const byId = new Map(lists.map((list) => [list.id, list]))
    for (const [entity, attributes] of this.#facts) {
      if (entityTypeOf(entity) !== ENTITY_TYPE.TODO) continue
      const text = attributes.get(ATTRIBUTE.TEXT)
      if (!text?.op) continue
      // A Todo does not project when its Todo List does not exist.
      const list = byId.get(listEntityOf(entity))
      if (!list) continue
      const completed = attributes.get(ATTRIBUTE.COMPLETED)
      const dueDate = attributes.get(ATTRIBUTE.DUE_DATE)
      list.todos.push({
        id: entity,
        text: /** @type {string} */ (text.v),
        completed: completed?.op ? /** @type {boolean} */ (completed.v) : false,
        dueDate: dueDate?.op ? /** @type {string} */ (dueDate.v) : null,
      })
    }

    /** @type {TodoLists} */
    const todoLists = {}
    for (const list of lists) {
      // Newest Todo first; oldest Todo List first. Both are pure functions of the id.
      list.todos.sort((left, right) => ascending(right.id, left.id))
      // Inserted in id order, and `selectTodoListSummaries` reads that order back
      // as creation order for its final tie-break. That survives only because an
      // `L`-prefixed id is never an integer-like key; see the note there.
      todoLists[list.id] = list
    }
    return todoLists
  }
}
