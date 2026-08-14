import {
  initialTodoListsUiState,
  todoListsUiReducer,
} from './todoListsUiState.ts'

describe('Todo Lists UI reducer', () => {
  it('moves between browsing, drafting, materialized, and abandoned states', () => {
    const browsing = { mode: 'browsing', activeListId: 'existing' } as const
    const drafting = todoListsUiReducer(browsing, {
      type: 'DRAFT_STARTED',
      reservedListId: 'draft',
    })
    expect(drafting).toEqual({
      mode: 'drafting',
      activeListId: 'draft',
      reservedListId: 'draft',
    })
    expect(todoListsUiReducer(drafting, {
      type: 'DRAFT_STARTED',
      reservedListId: 'ignored',
    })).toBe(drafting)
    expect(todoListsUiReducer(drafting, {
      type: 'LIST_MATERIALIZED',
      listId: 'draft',
    })).toEqual({ mode: 'browsing', activeListId: 'draft' })
    expect(todoListsUiReducer(drafting, {
      type: 'LIST_SELECTED',
      listId: 'existing',
    })).toEqual({ mode: 'browsing', activeListId: 'existing' })
    expect(todoListsUiReducer(drafting, { type: 'DRAFT_ESCAPED' })).toEqual({
      mode: 'browsing',
      activeListId: null,
    })
  })

  it('keeps the active Todo List while confirming deletion', () => {
    const browsing = { mode: 'browsing', activeListId: 'active' } as const
    const confirming = todoListsUiReducer(browsing, {
      type: 'DELETE_REQUESTED',
      targetListId: 'target',
    })
    expect(confirming).toEqual({
      mode: 'confirmingDelete',
      activeListId: 'active',
      targetListId: 'target',
    })
    expect(todoListsUiReducer(confirming, { type: 'DELETE_CANCELLED' })).toEqual(browsing)
    expect(todoListsUiReducer(confirming, {
      type: 'DELETE_CONFIRMED',
      nextListId: 'next',
    })).toEqual({ mode: 'browsing', activeListId: 'next' })
  })

  it('waits rather than settling for nothing when the log is empty', () => {
    expect(todoListsUiReducer(initialTodoListsUiState, {
      type: 'LIST_HYDRATED',
      listId: null,
    })).toBe(initialTodoListsUiState)
  })

  it('opens on the first Todo List once they arrive', () => {
    expect(todoListsUiReducer(initialTodoListsUiState, {
      type: 'LIST_HYDRATED',
      listId: 'first',
    })).toEqual({ mode: 'browsing', activeListId: 'first' })
  })

  it('never overrides a choice already made, including a deliberate none', () => {
    const chosen = { mode: 'browsing', activeListId: 'chosen' } as const
    expect(todoListsUiReducer(chosen, { type: 'LIST_HYDRATED', listId: 'first' })).toBe(chosen)

    // Escaping a draft leaves nothing selected on purpose, which is not the same
    // as never having selected.
    const escaped = todoListsUiReducer(chosen, { type: 'DRAFT_ESCAPED' })
    expect(todoListsUiReducer(escaped, { type: 'LIST_HYDRATED', listId: 'first' })).toBe(escaped)
  })

  it('forgets the selection when the server serves a different log', () => {
    const browsing = { mode: 'browsing', activeListId: 'from-old-log' } as const
    const reset = todoListsUiReducer(browsing, { type: 'UI_RESET' })
    expect(reset).toEqual(initialTodoListsUiState)
    // ...and is therefore able to open on the new log's first Todo List.
    expect(todoListsUiReducer(reset, { type: 'LIST_HYDRATED', listId: 'from-new-log' }))
      .toEqual({ mode: 'browsing', activeListId: 'from-new-log' })
  })
})
