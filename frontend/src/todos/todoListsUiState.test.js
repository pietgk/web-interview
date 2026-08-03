import { todoListsUiReducer } from './todoListsUiState'

describe('Todo Lists UI reducer', () => {
  it('moves between browsing, drafting, materialized, and abandoned states', () => {
    const browsing = /** @type {const} */ ({ mode: 'browsing', activeListId: 'existing' })
    const drafting = todoListsUiReducer(browsing, {
      type: 'ADD_LIST',
      reservedListId: 'draft',
    })
    expect(drafting).toEqual({
      mode: 'drafting',
      activeListId: 'draft',
      reservedListId: 'draft',
    })
    expect(todoListsUiReducer(drafting, {
      type: 'ADD_LIST',
      reservedListId: 'ignored',
    })).toBe(drafting)
    expect(todoListsUiReducer(drafting, {
      type: 'MATERIALIZE',
      listId: 'draft',
    })).toEqual({ mode: 'browsing', activeListId: 'draft' })
    expect(todoListsUiReducer(drafting, {
      type: 'SELECT_LIST',
      listId: 'existing',
    })).toEqual({ mode: 'browsing', activeListId: 'existing' })
    expect(todoListsUiReducer(drafting, { type: 'ESCAPE_DRAFT' })).toEqual({
      mode: 'browsing',
      activeListId: null,
    })
  })

  it('keeps the active Todo List while confirming deletion', () => {
    const browsing = /** @type {const} */ ({ mode: 'browsing', activeListId: 'active' })
    const confirming = todoListsUiReducer(browsing, {
      type: 'REQUEST_DELETE',
      targetListId: 'target',
    })
    expect(confirming).toEqual({
      mode: 'confirmingDelete',
      activeListId: 'active',
      targetListId: 'target',
    })
    expect(todoListsUiReducer(confirming, { type: 'CANCEL_DELETE' })).toEqual(browsing)
    expect(todoListsUiReducer(confirming, {
      type: 'CONFIRM_DELETE',
      nextListId: 'next',
    })).toEqual({ mode: 'browsing', activeListId: 'next' })
  })
})
