/**
 * `loading` is the screen before the Todo Lists have arrived. It exists so that
 * "have we chosen an initial Todo List yet?" is a state this machine owns rather
 * than a ref the machine cannot see (ADR 007).
 *
 * @typedef {{mode: 'loading', activeListId: null} | {mode: 'browsing', activeListId: string | null} | {mode: 'drafting', activeListId: string, reservedListId: string} | {mode: 'confirmingDelete', activeListId: string | null, targetListId: string}} TodoListsUiState
 */
/** @typedef {{type: 'ADD_LIST', reservedListId: string} | {type: 'SELECT_LIST', listId: string} | {type: 'MATERIALIZE', listId: string} | {type: 'ESCAPE_DRAFT'} | {type: 'REQUEST_DELETE', targetListId: string} | {type: 'CANCEL_DELETE'} | {type: 'CONFIRM_DELETE', nextListId: string | null} | {type: 'HYDRATE', listId: string | null} | {type: 'RESET'}} TodoListsUiEvent */

/** @type {TodoListsUiState} */
export const initialTodoListsUiState = { mode: 'loading', activeListId: null }

/** @param {TodoListsUiState} state @param {TodoListsUiEvent} event @returns {TodoListsUiState} */
export const todoListsUiReducer = (state, event) => {
  switch (event.type) {
    case 'ADD_LIST':
      if (state.mode === 'drafting') return state
      return {
        mode: 'drafting',
        activeListId: event.reservedListId,
        reservedListId: event.reservedListId,
      }
    case 'SELECT_LIST':
      return { mode: 'browsing', activeListId: event.listId }
    case 'MATERIALIZE':
      return { mode: 'browsing', activeListId: event.listId }
    case 'ESCAPE_DRAFT':
      return { mode: 'browsing', activeListId: null }
    case 'REQUEST_DELETE':
      return {
        mode: 'confirmingDelete',
        activeListId: state.activeListId,
        targetListId: event.targetListId,
      }
    case 'CANCEL_DELETE':
      return { mode: 'browsing', activeListId: state.activeListId }
    case 'CONFIRM_DELETE':
      return { mode: 'browsing', activeListId: event.nextListId }

    // The opening selection, and the only automatic one. It never overrides a
    // choice already made, and it waits rather than settling for nothing: on an
    // empty log there is nothing to select, so the screen stays `loading` until
    // a Todo List exists. Deliberately having nothing selected is `browsing`
    // with a null id, which this leaves alone.
    case 'HYDRATE':
      if (state.mode !== 'loading' || event.listId === null) return state
      return { mode: 'browsing', activeListId: event.listId }

    // The server is serving a different log. Selection named an entity in the
    // old one, so it means nothing now.
    case 'RESET':
      return initialTodoListsUiState

    default:
      return state
  }
}
