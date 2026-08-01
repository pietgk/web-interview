import {
  createInitialState,
  createListEntry,
  SAVE_STATUS,
  selectVisibleLists,
  todoListsReducer,
} from './todoListsState'
import { createTodo } from './todoModel'

describe('todoListsReducer', () => {
  const list = {
    id: '0000000001',
    title: 'First List',
    todos: [createTodo({ id: 't1', text: 'Original' })],
  }

  it('loads lists into per-list draft entries', () => {
    const state = todoListsReducer(createInitialState(), {
      type: 'LOAD_SUCCESS',
      lists: { [list.id]: list },
    })

    expect(state.loadState).toBe('ready')
    expect(state.lists[list.id].draft).toEqual(list.todos)
    expect(state.lists[list.id].status).toBe(SAVE_STATUS.CLEAN)
  })

  it('keeps drafts when switching the active list', () => {
    let state = todoListsReducer(createInitialState(), {
      type: 'LOAD_SUCCESS',
      lists: {
        a: { id: 'a', title: 'A', todos: [createTodo({ id: '1', text: 'A' })] },
        b: { id: 'b', title: 'B', todos: [createTodo({ id: '2', text: 'B' })] },
      },
    })
    state = todoListsReducer(state, { type: 'SET_ACTIVE_LIST', id: 'a' })
    state = todoListsReducer(state, {
      type: 'EDIT_DRAFT',
      id: 'a',
      todos: [createTodo({ id: '1', text: 'Edited A' })],
    })
    state = todoListsReducer(state, { type: 'SET_ACTIVE_LIST', id: 'b' })

    expect(state.lists.a.draft[0].text).toBe('Edited A')
    expect(state.lists.a.status).toBe(SAVE_STATUS.DIRTY)
    expect(state.activeListId).toBe('b')
  })

  it('ignores stale save acknowledgements', () => {
    let state = {
      ...createInitialState(),
      lists: {
        a: {
          ...createListEntry(list),
          draft: [createTodo({ id: 't1', text: 'newer' })],
          draftRevision: 2,
          ackRevision: 1,
          status: SAVE_STATUS.SAVING,
        },
      },
    }

    state = todoListsReducer(state, {
      type: 'SAVE_SUCCESS',
      id: 'a',
      revision: 0,
      todos: [createTodo({ id: 't1', text: 'stale' })],
    })

    expect(state.lists.a.draft[0].text).toBe('newer')
    expect(state.lists.a.ackRevision).toBe(1)
  })

  it('derives list completion from the current draft', () => {
    let state = todoListsReducer(createInitialState(), {
      type: 'LOAD_SUCCESS',
      lists: { [list.id]: list },
    })
    state = todoListsReducer(state, {
      type: 'EDIT_DRAFT',
      id: list.id,
      todos: [createTodo({ id: 't1', text: 'Original', completed: true })],
    })

    const visible = selectVisibleLists(state)
    expect(visible[0].completed).toBe(true)
  })

  it('marks failed saves as error while keeping the draft', () => {
    let state = todoListsReducer(createInitialState(), {
      type: 'LOAD_SUCCESS',
      lists: { [list.id]: list },
    })
    state = todoListsReducer(state, {
      type: 'EDIT_DRAFT',
      id: list.id,
      todos: [createTodo({ id: 't1', text: 'Edited' })],
    })
    state = todoListsReducer(state, {
      type: 'SAVE_ERROR',
      id: list.id,
      error: 'network down',
    })

    expect(state.lists[list.id].draft[0].text).toBe('Edited')
    expect(state.lists[list.id].status).toBe(SAVE_STATUS.ERROR)
    expect(state.lists[list.id].error).toBe('network down')
  })
})
