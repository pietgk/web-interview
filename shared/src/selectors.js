import { CONNECTION } from './todoProtocol.js'

/** @typedef {import('./types.js').Todo} Todo */
/** @typedef {import('./types.js').TodoList} TodoList */
/** @typedef {import('./types.js').TodoLists} TodoLists */
/** @typedef {import('./types.js').TodoClientStatus} TodoClientStatus */
/** @typedef {{id: string, title: string, completed: boolean, completedCount: number, totalCount: number, nextDueDate: string | null}} TodoListSummary */

/** @param {Todo[]} [todos] */
export const isTodoListCompleted = (todos = []) =>
  todos.length > 0 && todos.every((todo) => todo.completed)

/**
 * @param {TodoList} todoList
 * @returns {TodoListSummary}
 */
export const selectListSummary = (todoList) => ({
  id: todoList.id,
  title: todoList.title,
  completed: isTodoListCompleted(todoList.todos),
  completedCount: todoList.todos.filter((todo) => todo.completed).length,
  totalCount: todoList.todos.length,
  nextDueDate: todoList.todos.reduce(
    (earliest, todo) =>
      !todo.completed && todo.dueDate && (!earliest || todo.dueDate < earliest)
        ? todo.dueDate
        : earliest,
    /** @type {string | null} */ (null)
  ),
})

/**
 * Display order: Todo Lists with something due first and soonest-first among
 * them, then those with nothing due, then Completed Todo Lists. Ties fall back
 * to creation order.
 *
 * `sourceIndex` is that creation order, and it is load-bearing rather than
 * incidental. `DatomStore` inserts Todo Lists into the read model in ascending
 * id order, which is creation order because a ULID sorts by time, and
 * `Object.values` gives those keys back in insertion order. That last step holds
 * only because a Todo List id is not an integer-like key: JavaScript returns
 * integer-like keys first in numeric order and every other key in insertion
 * order. The `L` prefix on an id therefore carries sort stability as well as
 * entity type, so dropping it would silently reshuffle equal-ranked Todo Lists.
 *
 * @param {TodoLists} todoLists
 * @returns {TodoListSummary[]}
 */
export const selectTodoListSummaries = (todoLists) =>
  Object.values(todoLists)
    .map((todoList, sourceIndex) => ({
      ...selectListSummary(todoList),
      sourceIndex,
    }))
    .sort((left, right) => {
      const leftBucket = left.completed ? 2 : left.nextDueDate ? 0 : 1
      const rightBucket = right.completed ? 2 : right.nextDueDate ? 0 : 1
      if (leftBucket !== rightBucket) return leftBucket - rightBucket
      if (leftBucket === 0 && left.nextDueDate !== right.nextDueDate) {
        return /** @type {string} */ (left.nextDueDate).localeCompare(
          /** @type {string} */ (right.nextDueDate)
        )
      }
      return left.sourceIndex - right.sourceIndex
    })
    .map(({ sourceIndex, ...summary }) => summary)

const titlePart = { id: 'title', text: 'Things to do' }

/**
 * One status line over what the client knows about delivery and recovery. A
 * permanent rejection outranks connection and saving copy so the UI cannot call
 * a rejected optimistic change saved while authoritative state is being restored.
 *
 * @param {TodoClientStatus} status
 * @returns {import('./types.js').StatusBarModel}
 */
export const selectStatusBar = ({ connection, pendingCount, saving, failure }) => {
  const details = failure
    ? {
        status: failure.status,
        code: failure.code,
        message: failure.message,
        issues: failure.issues,
      }
    : null

  if (failure && failure.kind !== 'network') {
    return {
      severity: 'error',
      parts: [titlePart, { id: 'sync', text: 'Changes not saved' }],
      action: null,
      details,
    }
  }
  if (connection === CONNECTION.FAILED) {
    return {
      severity: 'error',
      parts: [titlePart, { id: 'connection', text: 'Connection lost' }],
      action: { label: 'Reconnect', event: 'RECONNECT' },
      details,
    }
  }
  if (connection === CONNECTION.CONNECTING) {
    return {
      severity: 'info',
      parts: [titlePart, { id: 'connection', text: 'Connecting…' }],
      action: null,
      details: null,
    }
  }
  if (connection === CONNECTION.RECONNECTING) {
    return {
      severity: 'warning',
      parts: [
        titlePart,
        { id: 'connection', text: 'Connection lost' },
        {
          id: 'sync',
          text: pendingCount > 0 ? 'Waiting for connection' : 'Reconnecting…',
        },
      ],
      action: null,
      details,
    }
  }
  // Delivery is what matters, and the outbox can stall while the stream is still
  // nominally open. Saying "Saving…" forever would be a lie.
  if (failure && pendingCount > 0) {
    return {
      severity: 'warning',
      parts: [titlePart, { id: 'sync', text: 'Waiting for connection' }],
      action: null,
      details,
    }
  }
  if (saving) {
    return {
      severity: 'info',
      parts: [titlePart, { id: 'sync', text: 'Saving…' }],
      action: null,
      details: null,
    }
  }
  return {
    severity: 'success',
    parts: [titlePart, { id: 'saved', text: 'All changes saved' }],
    action: null,
    details: null,
  }
}
