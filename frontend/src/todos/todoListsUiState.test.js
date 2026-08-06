import {
  initialTodoListsUiState,
  todoListsUiReducer,
} from './todoListsUiState'

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

  it('waits rather than settling for nothing when the log is empty', () => {
    expect(todoListsUiReducer(initialTodoListsUiState, {
      type: 'HYDRATE',
      listId: null,
    })).toBe(initialTodoListsUiState)
  })

  it('opens on the first Todo List once they arrive', () => {
    expect(todoListsUiReducer(initialTodoListsUiState, {
      type: 'HYDRATE',
      listId: 'first',
    })).toEqual({ mode: 'browsing', activeListId: 'first' })
  })

  it('never overrides a choice already made, including a deliberate none', () => {
    const chosen = /** @type {const} */ ({ mode: 'browsing', activeListId: 'chosen' })
    expect(todoListsUiReducer(chosen, { type: 'HYDRATE', listId: 'first' })).toBe(chosen)

    // Escaping a draft leaves nothing selected on purpose, which is not the same
    // as never having selected.
    const escaped = todoListsUiReducer(chosen, { type: 'ESCAPE_DRAFT' })
    expect(todoListsUiReducer(escaped, { type: 'HYDRATE', listId: 'first' })).toBe(escaped)
  })

  it('forgets the selection when the server serves a different log', () => {
    const browsing = /** @type {const} */ ({ mode: 'browsing', activeListId: 'from-old-log' })
    const reset = todoListsUiReducer(browsing, { type: 'RESET' })
    expect(reset).toEqual(initialTodoListsUiState)
    // ...and is therefore able to open on the new log's first Todo List.
    expect(todoListsUiReducer(reset, { type: 'HYDRATE', listId: 'from-new-log' }))
      .toEqual({ mode: 'browsing', activeListId: 'from-new-log' })
  })
})
