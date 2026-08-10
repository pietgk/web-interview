/**
 * `loading` is the screen before the Todo Lists have arrived. It exists so that
 * "have we chosen an initial Todo List yet?" is a state this machine owns rather
 * than a ref the machine cannot see (ADR 007).
 *
 * @typedef {{mode: 'loading', activeListId: null} | {mode: 'browsing', activeListId: string | null} | {mode: 'drafting', activeListId: string, reservedListId: string} | {mode: 'confirmingDelete', activeListId: string | null, targetListId: string}} TodoListsUiState
 */
/** @typedef {{type: 'DRAFT_STARTED', reservedListId: string} | {type: 'LIST_SELECTED', listId: string} | {type: 'LIST_MATERIALIZED', listId: string} | {type: 'DRAFT_ESCAPED'} | {type: 'DELETE_REQUESTED', targetListId: string} | {type: 'DELETE_CANCELLED'} | {type: 'DELETE_CONFIRMED', nextListId: string | null} | {type: 'LIST_HYDRATED', listId: string | null} | {type: 'UI_RESET'}} TodoListsUiEvent */

/** @type {TodoListsUiState} */
export const initialTodoListsUiState = { mode: 'loading', activeListId: null }

/** @param {TodoListsUiState} state @param {TodoListsUiEvent} event @returns {TodoListsUiState} */
export const todoListsUiReducer = (state, event) => {
  switch (event.type) {
    case 'DRAFT_STARTED':
      if (state.mode === 'drafting') return state
      return {
        mode: 'drafting',
        activeListId: event.reservedListId,
        reservedListId: event.reservedListId,
      }
    case 'LIST_SELECTED':
      return { mode: 'browsing', activeListId: event.listId }
    case 'LIST_MATERIALIZED':
      return { mode: 'browsing', activeListId: event.listId }
    case 'DRAFT_ESCAPED':
      return { mode: 'browsing', activeListId: null }
    case 'DELETE_REQUESTED':
      return {
        mode: 'confirmingDelete',
        activeListId: state.activeListId,
        targetListId: event.targetListId,
      }
    case 'DELETE_CANCELLED':
      return { mode: 'browsing', activeListId: state.activeListId }
    case 'DELETE_CONFIRMED':
      return { mode: 'browsing', activeListId: event.nextListId }

    // The opening selection, and the only automatic one. It never overrides a
    // choice already made, and it waits rather than settling for nothing: on an
    // empty log there is nothing to select, so the screen stays `loading` until
    // a Todo List exists. Deliberately having nothing selected is `browsing`
    // with a null id, which this leaves alone.
    case 'LIST_HYDRATED':
      if (state.mode !== 'loading' || event.listId === null) return state
      return { mode: 'browsing', activeListId: event.listId }

    // The server is serving a different log. Selection named an entity in the
    // old one, so it means nothing now.
    case 'UI_RESET':
      return initialTodoListsUiState

    default:
      return state
  }
}
