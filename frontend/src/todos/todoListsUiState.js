/** @typedef {{mode: 'browsing', activeListId: string | null} | {mode: 'drafting', activeListId: string, reservedListId: string} | {mode: 'confirmingDelete', activeListId: string | null, targetListId: string}} TodoListsUiState */
/** @typedef {{type: 'ADD_LIST', reservedListId: string} | {type: 'SELECT_LIST', listId: string} | {type: 'MATERIALIZE', listId: string} | {type: 'ESCAPE_DRAFT'} | {type: 'REQUEST_DELETE', targetListId: string} | {type: 'CANCEL_DELETE'} | {type: 'CONFIRM_DELETE', nextListId: string | null} | {type: 'SET_ACTIVE', listId: string | null}} TodoListsUiEvent */

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
    case 'SET_ACTIVE':
      return { mode: 'browsing', activeListId: event.listId }
    default:
      return state
  }
}
