import { transactionAffectsList } from './todoListActor.js'
import { PERSISTENCE_STATUS, SYNC_STATUS } from './todoProtocol.js'

export const isListCompleted = (todos = []) =>
  todos.length > 0 && todos.every((todo) => todo.completed)

export const selectTodoLists = (snapshot) => snapshot.readModel

export const selectListSummary = (todoList) => ({
  id: todoList.id,
  title: todoList.title,
  completed: isListCompleted(todoList.todos),
  completedCount: todoList.todos.filter((todo) => todo.completed).length,
  totalCount: todoList.todos.length,
})

export const hasLocallyUndurableChanges = (snapshot) =>
  snapshot.persistenceStatus === PERSISTENCE_STATUS.WRITING ||
  snapshot.persistenceStatus === PERSISTENCE_STATUS.FAILED

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
