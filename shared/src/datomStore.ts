import {
  ATTRIBUTE,
  ENTITY_TYPE,
  entityTypeOf,
  listEntityOf,
} from './datom.ts'
import type { Attribute, Datom, Fact, TodoList, TodoLists } from './types.ts'

const ascending = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0)

/**
 * The fold both sides run verbatim: an append-only log of single datoms projected
 * by last-write-wins. `apply` is a comparison and an assignment, so re-delivering
 * a datom is an exact no-op and needs no idempotency bookkeeping.
 */
export class DatomStore {
  #facts = new Map<string, Map<Attribute, Fact>>()

  #readModel: TodoLists | null = null

  #listeners = new Set<() => void>()

  /** @returns whether the datom won on `tx` */
  apply([entity, attribute, value, tx, op]: Datom): boolean {
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
   * @param tx every winning datom when omitted
   */
  datomsSince(tx?: string): Datom[] {
    const datoms: Datom[] = []
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
   * @returns whether there was anything to forget
   */
  clear(): boolean {
    if (this.#facts.size === 0) return false
    this.#facts.clear()
    this.#readModel = null
    for (const listener of this.#listeners) listener()
    return true
  }

  /**
   * Memoized because `useSyncExternalStore` requires a referentially stable
   * snapshot; the memo is dropped whenever a datom wins.
   */
  readModel(): TodoLists {
    if (!this.#readModel) this.#readModel = this.#project()
    return this.#readModel
  }

  subscribe(listener: () => void) {
    this.#listeners.add(listener)
    return { unsubscribe: () => this.#listeners.delete(listener) }
  }

  #project(): TodoLists {
    const lists: TodoList[] = []
    for (const [entity, attributes] of this.#facts) {
      if (entityTypeOf(entity) !== ENTITY_TYPE.TODO_LIST) continue
      const title = attributes.get(ATTRIBUTE.TITLE)
      if (!title?.op) continue
      lists.push({ id: entity, title: title.v as string, todos: [] })
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
        text: text.v as string,
        completed: completed?.op ? completed.v as boolean : false,
        dueDate: dueDate?.op ? dueDate.v as string : null,
      })
    }

    const todoLists: TodoLists = {}
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
