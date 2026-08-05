import { CONNECTION } from '@web-interview/todos/protocol'
import { selectTodoListSummaries } from '@web-interview/todos/selectors'

/** @typedef {import('@web-interview/todos/types').TodoList} TodoList */
/** @typedef {import('@web-interview/todos/types').TodoLists} TodoLists */
/** @typedef {import('@web-interview/todos/types').TodoClientStatus} TodoClientStatus */
/** @typedef {import('@web-interview/todos/selectors').TodoListSummary} TodoListSummary */
/** @typedef {import('./todoListsUiState').TodoListsUiState} TodoListsUiState */

/**
 * Everything the Todo Lists screen renders, and nothing else (ADR 007). Pure: no
 * hooks, no refs, no writes, so it is callable from a test with three literals.
 *
 * It answers the questions the screen actually asks, rather than handing back
 * the read model for the component to interrogate. A draft Todo List is the
 * interesting case: it has an id but no datom yet, so it cannot come from the
 * read model and is synthesized here.
 *
 * @param {TodoLists} readModel
 * @param {TodoListsUiState} uiState
 * @param {TodoClientStatus} status
 */
export const selectTodoListsScreen = (readModel, uiState, status) => {
  const drafting = uiState.mode === 'drafting'
  return {
    summaries: selectTodoListSummaries(readModel),
    drafting,

    /** @type {TodoList | null} */
    activeList: drafting
      ? { id: uiState.reservedListId, title: '', todos: [] }
      : uiState.activeListId
        ? readModel[uiState.activeListId] ?? null
        : null,

    /** @type {TodoList | null} */
    confirmingList: uiState.mode === 'confirmingDelete'
      ? readModel[uiState.targetListId] ?? null
      : null,

    // The stream sends the compacted set before it sends server time, so
    // `canEdit` also means "the Todo Lists have arrived".
    hydrated: status.canEdit || status.connection !== CONNECTION.CONNECTING,
  }
}

/**
 * Which Todo List should take selection when one is deleted: the one after it,
 * else the one before it, else none. Deleting a Todo List that is not the active
 * one moves selection nowhere.
 *
 * @param {TodoListSummary[]} summaries ordered as rendered
 * @param {string | null} activeListId
 * @param {string} deletedListId
 * @returns {string | null}
 */
export const selectListAfterDeletion = (summaries, activeListId, deletedListId) => {
  if (activeListId !== deletedListId) return activeListId
  const index = summaries.findIndex((summary) => summary.id === deletedListId)
  return summaries[index + 1]?.id ?? summaries[index - 1]?.id ?? null
}
