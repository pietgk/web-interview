import { CONNECTION } from '@web-interview/todos/protocol'
import type { TodoClientStatus } from '@web-interview/todos/types'
import {
  selectListAfterDeletion,
  selectTodoListsScreen,
} from './todoListsScreenView.ts'
import type { TodoListsUiState } from './todoListsUiState.ts'

const clientStatus = (status: Partial<TodoClientStatus> = {}) => ({
  connection: CONNECTION.LIVE,
  pendingCount: 0,
  saving: false,
  canEdit: true,
  rehydrating: false,
  failure: null,
  epoch: 'epoch',
  ...status,
})

const readModel = {
  L1: { id: 'L1', title: 'Groceries', todos: [] },
  L2: { id: 'L2', title: 'Release', todos: [] },
}

describe('Todo Lists screen view', () => {
  it('resolves the active Todo List from the read model while browsing', () => {
    const view = selectTodoListsScreen(
      readModel,
      { mode: 'browsing', activeListId: 'L2' },
      clientStatus()
    )
    expect(view.activeList).toBe(readModel.L2)
    expect(view.drafting).toBe(false)
    expect(view.confirmingList).toBe(null)
    expect(view.summaries.map((summary) => summary.id)).toEqual(['L1', 'L2'])
  })

  it('has no active Todo List when none is selected', () => {
    const view = selectTodoListsScreen(
      readModel,
      { mode: 'browsing', activeListId: null },
      clientStatus()
    )
    expect(view.activeList).toBe(null)
  })

  it('has no active Todo List when the selected one has been deleted elsewhere', () => {
    const view = selectTodoListsScreen(
      readModel,
      { mode: 'browsing', activeListId: 'gone' },
      clientStatus()
    )
    expect(view.activeList).toBe(null)
  })

  it('synthesizes a draft Todo List, because a reserved id has no datom yet', () => {
    const view = selectTodoListsScreen(
      readModel,
      { mode: 'drafting', activeListId: 'L9', reservedListId: 'L9' },
      clientStatus()
    )
    expect(view.drafting).toBe(true)
    expect(view.activeList).toEqual({ id: 'L9', title: '', todos: [] })
  })

  it('resolves the Todo List a confirmation is about, and forgets it once deleted', () => {
    const confirming: TodoListsUiState = {
      mode: 'confirmingDelete',
      activeListId: 'L1',
      targetListId: 'L1',
    }
    expect(selectTodoListsScreen(readModel, confirming, clientStatus()).confirmingList)
      .toBe(readModel.L1)
    expect(selectTodoListsScreen({}, confirming, clientStatus()).confirmingList).toBe(null)
  })

  it('counts a clock as proof the Todo Lists arrived, because the set is sent first', () => {
    const connecting = { connection: CONNECTION.CONNECTING, canEdit: false }
    const browsing = { mode: 'browsing', activeListId: null } as const

    expect(selectTodoListsScreen(readModel, browsing, clientStatus(connecting)).hydrated)
      .toBe(false)
    expect(selectTodoListsScreen(readModel, browsing, clientStatus({
      ...connecting,
      canEdit: true,
    })).hydrated).toBe(true)
    // Still no clock, but the stream has answered, so the set has landed.
    expect(selectTodoListsScreen(readModel, browsing, clientStatus({
      connection: CONNECTION.FAILED,
      canEdit: false,
    })).hydrated).toBe(true)
  })
})

describe('selection after deleting a Todo List', () => {
  const summaries = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as never

  it('leaves selection alone when the deleted Todo List was not the active one', () => {
    expect(selectListAfterDeletion(summaries, 'a', 'c')).toBe('a')
  })

  it('takes the next Todo List', () => {
    expect(selectListAfterDeletion(summaries, 'b', 'b')).toBe('c')
  })

  it('falls back to the previous one when the last is deleted', () => {
    expect(selectListAfterDeletion(summaries, 'c', 'c')).toBe('b')
  })

  it('selects nothing when the only Todo List is deleted', () => {
    expect(selectListAfterDeletion([{ id: 'a' }] as never, 'a', 'a')).toBe(null)
  })
})
