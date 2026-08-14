import { CONNECTION } from '@web-interview/todos/protocol'
import { selectTodoListSummaries } from '@web-interview/todos/selectors'
import type { TodoListSummary } from '@web-interview/todos/selectors'
import type { TodoClientStatus, TodoList, TodoLists } from '@web-interview/todos/types'
import type { TodoListsUiState } from './todoListsUiState.ts'

/**
 * Everything the Todo Lists screen renders, and nothing else (ADR 007). Pure: no
 * hooks, no refs, no writes, so it is callable from a test with three literals.
 * It answers the questions the screen actually asks, rather than handing back
 * the read model for the component to interrogate. A draft Todo List is the
 * interesting case: it has an id but no datom yet, so it cannot come from the
 * read model and is synthesized here.
 */
export const selectTodoListsScreen = (readModel: TodoLists, uiState: TodoListsUiState, status: TodoClientStatus) => {
  const drafting = uiState.mode === 'drafting'
  return {
    summaries: selectTodoListSummaries(readModel),
    drafting,

    activeList: (drafting
      ? { id: uiState.reservedListId, title: '', todos: [] }
      : uiState.activeListId
        ? readModel[uiState.activeListId] ?? null
        : null) as TodoList | null,

    confirmingList: (uiState.mode === 'confirmingDelete'
      ? readModel[uiState.targetListId] ?? null
      : null) as TodoList | null,

    // The stream sends the compacted set before it sends server time, so
    // `canEdit` also means "the Todo Lists have arrived".
    hydrated: status.canEdit || status.connection !== CONNECTION.CONNECTING,
  }
}

/**
 * Which Todo List should take selection when one is deleted: the one after it,
 * else the one before it, else none. Deleting a Todo List that is not the active
 * one moves selection nowhere.
 */
export const selectListAfterDeletion = (summaries: TodoListSummary[], activeListId: string | null, deletedListId: string): string | null => {
  if (activeListId !== deletedListId) return activeListId
  const index = summaries.findIndex((summary) => summary.id === deletedListId)
  return summaries[index + 1]?.id ?? summaries[index - 1]?.id ?? null
}
