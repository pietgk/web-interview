import { transactionAffectsList } from './todoListActor.js'

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
  snapshot.persistenceStatus === 'writing' || snapshot.persistenceStatus === 'failed'

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
  if (snapshot.persistenceStatus === 'failed' && hasPending) {
    return {
      message: `Save failed: ${snapshot.error}`,
      tone: 'error',
      showRetry: true,
      saveError: snapshot.error,
    }
  }
  if (snapshot.syncStatus === 'failed' && hasPending) {
    return {
      message: `Save failed: ${snapshot.error}`,
      tone: 'error',
      showRetry: true,
      saveError: snapshot.error,
    }
  }
  if (snapshot.syncStatus === 'offline' && hasPending) {
    return {
      message: 'Saved offline',
      tone: 'secondary',
      showRetry: true,
      saveError: snapshot.error,
    }
  }
  if (hasPending) {
    return {
      message: snapshot.syncStatus === 'syncing' ? 'Saving…' : 'Unsaved changes',
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
