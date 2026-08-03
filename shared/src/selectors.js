import { ACTOR_STATUS, PERSISTENCE_STATUS, SYNC_STATUS } from './todoProtocol.js'

/** @typedef {import('./types.js').Todo} Todo */
/** @typedef {import('./types.js').TodoList} TodoList */
/** @typedef {import('./types.js').TodoLists} TodoLists */
/** @typedef {import('./types.js').TodoListSnapshot} TodoListSnapshot */
/** @typedef {{id: string, title: string, completed: boolean, completedCount: number, totalCount: number, nextDueDate: string | null}} TodoListSummary */

/** @param {Todo[]} [todos] */
export const isListCompleted = (todos = []) =>
  todos.length > 0 && todos.every((todo) => todo.completed)

/**
 * @param {TodoListSnapshot} snapshot
 * @returns {TodoLists}
 */
export const selectTodoLists = (snapshot) => snapshot.readModel

/**
 * @param {TodoList} todoList
 * @returns {TodoListSummary}
 */
export const selectListSummary = (todoList) => ({
  id: todoList.id,
  title: todoList.title,
  completed: isListCompleted(todoList.todos),
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

/** @param {Pick<TodoListSnapshot, 'persistenceStatus'>} snapshot */
export const hasLocallyUndurableChanges = (snapshot) =>
  snapshot.persistenceStatus === PERSISTENCE_STATUS.WRITING ||
  snapshot.persistenceStatus === PERSISTENCE_STATUS.FAILED

const titlePart = { id: 'title', text: 'Things to do' }

/**
 * @param {Pick<TodoListSnapshot, 'status' | 'pendingTransactions' | 'rejectedTransactions' | 'persistenceStatus' | 'syncStatus' | 'error'>} snapshot
 * @returns {import('./types.js').StatusBarModel}
 */
export const selectStatusBar = (snapshot) => {
  if (snapshot.status === ACTOR_STATUS.IDLE || snapshot.status === ACTOR_STATUS.LOADING) {
    return {
      severity: 'info',
      parts: [titlePart, { id: 'loading', text: 'Loading Todo Lists…' }],
      action: null,
      details: null,
      dismissible: false,
    }
  }
  if (snapshot.status === ACTOR_STATUS.ERROR) {
    return {
      severity: 'error',
      parts: [titlePart, { id: 'loading', text: 'Todo Lists could not be loaded' }],
      action: { label: 'Retry loading', event: 'RELOAD' },
      details: snapshot.error ? { reason: snapshot.error } : null,
      dismissible: false,
    }
  }
  if (snapshot.persistenceStatus === PERSISTENCE_STATUS.FAILED) {
    return {
      severity: 'error',
      parts: [titlePart, { id: 'durability', text: 'Changes are not safely saved' }],
      action: { label: 'Retry local save', event: 'RETRY_PERSISTENCE' },
      details: snapshot.error ? { reason: snapshot.error } : null,
      dismissible: false,
    }
  }

  const rejection = snapshot.rejectedTransactions[0]
  if (rejection) {
    return {
      severity: 'error',
      parts: [titlePart, { id: 'rejection', text: 'A change could not be applied' }],
      action: { label: 'Review', event: 'REVIEW_REJECTION' },
      details: {
        rejectionId: rejection.id,
        listId: rejection.listId ?? null,
        reason: rejection.error,
        issues: rejection.issues ?? [],
        rolledBack: true,
      },
      dismissible: true,
    }
  }
  if (snapshot.syncStatus === SYNC_STATUS.FAILED) {
    return {
      severity: 'warning',
      parts: [
        titlePart,
        { id: 'durability', text: 'Saved on this device' },
        { id: 'sync', text: 'Server sync failed' },
      ],
      action: { label: 'Retry server synchronization', event: 'RETRY_SYNC' },
      details: snapshot.error ? { reason: snapshot.error } : null,
      dismissible: false,
    }
  }
  if (snapshot.syncStatus === SYNC_STATUS.OFFLINE) {
    const hasPending = snapshot.pendingTransactions.length > 0
    return {
      severity: 'warning',
      parts: hasPending
        ? [
            titlePart,
            { id: 'durability', text: 'Saved on this device' },
            { id: 'sync', text: 'Waiting for connection' },
          ]
        : [
            titlePart,
            { id: 'connection', text: 'Offline' },
            { id: 'sync', text: 'No unsynchronized changes' },
          ],
      action: null,
      details: snapshot.error ? { reason: snapshot.error } : null,
      dismissible: false,
    }
  }
  if (snapshot.persistenceStatus === PERSISTENCE_STATUS.WRITING) {
    return {
      severity: 'info',
      parts: [titlePart, { id: 'durability', text: 'Saving on this device…' }],
      action: null,
      details: null,
      dismissible: false,
    }
  }
  if (
    snapshot.pendingTransactions.length > 0 ||
    snapshot.syncStatus === SYNC_STATUS.SYNCING
  ) {
    return {
      severity: 'info',
      parts: [
        titlePart,
        { id: 'durability', text: 'Saved on this device' },
        { id: 'sync', text: 'Synchronizing…' },
      ],
      action: null,
      details: null,
      dismissible: false,
    }
  }
  return {
    severity: 'success',
    parts: [titlePart, { id: 'saved', text: 'All changes saved' }],
    action: null,
    details: null,
    dismissible: false,
  }
}
