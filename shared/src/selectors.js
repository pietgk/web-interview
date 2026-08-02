import { transactionAffectsList } from './todoListActor.js'
import { PERSISTENCE_STATUS, SYNC_STATUS } from './todoProtocol.js'

/** @typedef {import('./types.js').Todo} Todo */
/** @typedef {import('./types.js').TodoList} TodoList */
/** @typedef {import('./types.js').TodoLists} TodoLists */
/** @typedef {import('./types.js').TodoListSnapshot} TodoListSnapshot */
/** @typedef {{id: string, title: string, completed: boolean, completedCount: number, totalCount: number}} TodoListSummary */
/** @typedef {{message: string, tone: 'error' | 'secondary', showRetry: boolean, saveError: string | null}} TodoListSaveChrome */

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
})

/** @param {Pick<TodoListSnapshot, 'persistenceStatus'>} snapshot */
export const hasLocallyUndurableChanges = (snapshot) =>
  snapshot.persistenceStatus === PERSISTENCE_STATUS.WRITING ||
  snapshot.persistenceStatus === PERSISTENCE_STATUS.FAILED

/**
 * @param {TodoListSnapshot} snapshot
 * @param {string} listId
 * @returns {TodoListSaveChrome}
 */
export const selectListSaveChrome = (snapshot, listId) => {
  const hasPending = snapshot.pendingTransactions.some((transaction) =>
    transactionAffectsList(transaction, listId)
  )
  const rejected = snapshot.rejectedTransactions.find((entry) => entry.listId === listId)

  if (rejected) {
    return {
      message: `Save failed: ${rejected.error}`,
      tone: 'error',
      showRetry: false,
      saveError: rejected.error,
    }
  }
  if (snapshot.persistenceStatus === PERSISTENCE_STATUS.FAILED && hasPending) {
    return {
      message: `Save failed: ${snapshot.error}`,
      tone: 'error',
      showRetry: true,
      saveError: snapshot.error,
    }
  }
  if (snapshot.syncStatus === SYNC_STATUS.FAILED && hasPending) {
    return {
      message: `Save failed: ${snapshot.error}`,
      tone: 'error',
      showRetry: true,
      saveError: snapshot.error,
    }
  }
  if (snapshot.syncStatus === SYNC_STATUS.OFFLINE && hasPending) {
    return {
      message: 'Saved offline',
      tone: 'secondary',
      showRetry: true,
      saveError: snapshot.error,
    }
  }
  if (hasPending) {
    return {
      message:
        snapshot.syncStatus === SYNC_STATUS.SYNCING
          ? 'Saving…'
          : 'Unsaved changes',
      tone: 'secondary',
      showRetry: false,
      saveError: null,
    }
  }
  return {
    message: 'All changes saved',
    tone: 'secondary',
    showRetry: false,
    saveError: null,
  }
}
