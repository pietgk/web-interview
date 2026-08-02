import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  applyTransaction,
  databaseFromReadModel,
  projectTodoLists,
  SYNC_DEBOUNCE_MS,
} from '@web-interview/todo-contract'
import { TodoLists } from './TodoLists'
import * as api from '../../api/todoLists'
import { createTodo } from '../todoModel'

vi.mock('../../api/todoLists', () => ({
  fetchTodoReadModel: vi.fn(),
  syncTodoLists: vi.fn(),
}))

const seedLists = {
  '0000000001': {
    id: '0000000001',
    title: 'First List',
    todos: [createTodo({ id: 't1', text: 'First todo of first list!' })],
  },
  '0000000002': {
    id: '0000000002',
    title: 'Second List',
    todos: [createTodo({ id: 't2', text: 'First todo of second list!' })],
  },
}

let serverDatabase

const installServer = (todoLists = seedLists) => {
  serverDatabase = databaseFromReadModel(todoLists, 1)
  api.fetchTodoReadModel.mockImplementation(async () => ({
    basis: serverDatabase.basis,
    todoLists: projectTodoLists(serverDatabase),
  }))
  api.syncTodoLists.mockImplementation(async ({ transactions }) => {
    const acceptedTransactionIds = []
    for (const transaction of transactions) {
      const canonical = {
        ...transaction,
        serverSeq: serverDatabase.basis + 1,
        serverAt: new Date().toISOString(),
      }
      serverDatabase = applyTransaction(serverDatabase, canonical).database
      acceptedTransactionIds.push(transaction.id)
    }
    return {
      basis: serverDatabase.basis,
      todoLists: projectTodoLists(serverDatabase),
      acceptedTransactionIds,
      rejectedTransactions: [],
    }
  })
}

const loadLists = async () => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
  await screen.findByText('My Todo Lists')
}

const advanceAutosave = async () => {
  await act(async () => {
    vi.advanceTimersByTime(SYNC_DEBOUNCE_MS)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('TodoLists shared replica actor', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.stubGlobal('indexedDB', undefined)
    installServer()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('summarizes incomplete and empty lists from the actor read model', async () => {
    installServer({
      ...seedLists,
      '0000000002': { ...seedLists['0000000002'], todos: [] },
    })

    render(<TodoLists style={{}} />)
    await loadLists()

    expect(screen.getByText('0 of 1 completed')).toBeInTheDocument()
    expect(screen.getByText('No todos yet')).toBeInTheDocument()
  })

  it('applies edits optimistically and synchronizes a transaction batch', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TodoLists style={{}} />)
    await loadLists()
    await user.click(screen.getByText('First List'))

    const field = screen.getByLabelText('What to do?')
    await user.clear(field)
    await user.type(field, 'Synced edit')

    expect(field).toHaveValue('Synced edit')
    expect(api.syncTodoLists).not.toHaveBeenCalled()
    await advanceAutosave()

    await waitFor(() => expect(api.syncTodoLists).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('All changes saved')).toBeInTheDocument()
  })

  it('flushes pending transactions when focus leaves the editor', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TodoLists style={{}} />)
    await loadLists()
    await user.click(screen.getByText('First List'))
    await user.clear(screen.getByLabelText('What to do?'))
    await user.type(screen.getByLabelText('What to do?'), 'Switch now')

    await user.click(screen.getByText('Second List'))

    await waitFor(() => expect(api.syncTodoLists).toHaveBeenCalledTimes(1))
    await user.click(screen.getByText('First List'))
    expect(screen.getByLabelText('What to do?')).toHaveValue('Switch now')
  })

  it('retains an offline edit and retries synchronization', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const successfulSync = api.syncTodoLists.getMockImplementation()
    api.syncTodoLists
      .mockRejectedValueOnce(new Error('network down'))
      .mockImplementation(successfulSync)
    render(<TodoLists style={{}} />)
    await loadLists()
    await user.click(screen.getByText('First List'))
    await user.clear(screen.getByLabelText('What to do?'))
    await user.type(screen.getByLabelText('What to do?'), 'Retry me')
    await advanceAutosave()

    expect(await screen.findByText(/Save failed: network down/)).toBeInTheDocument()
    expect(screen.getByLabelText('What to do?')).toHaveValue('Retry me')

    await user.click(screen.getByRole('button', { name: 'Retry saving todo list' }))
    await waitFor(() => expect(api.syncTodoLists).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('All changes saved')).toBeInTheDocument()
  })

  it('updates list completion before server acknowledgement', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    let resolveSync
    api.syncTodoLists.mockImplementationOnce(
      () => new Promise((resolve) => { resolveSync = resolve })
    )
    render(<TodoLists style={{}} />)
    await loadLists()
    await user.click(screen.getByText('First List'))

    await user.click(screen.getByLabelText('Mark completed: First todo of first list!'))

    expect(screen.getByText('1 of 1 completed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /First List/ })).toHaveAttribute(
      'aria-current',
      'true'
    )
    resolveSync?.({
      basis: 1,
      todoLists: seedLists,
      acceptedTransactionIds: [],
      rejectedTransactions: [],
    })
  })

  it('materializes, commits, and dematerializes the ghost composer', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TodoLists style={{}} />)
    await loadLists()
    await user.click(screen.getByText('First List'))

    const composer = screen.getByLabelText('Add a todo')
    await user.type(composer, 'Ghost born')
    expect(screen.getAllByLabelText('What to do?')).toHaveLength(1)

    await user.keyboard('{Enter}')
    expect(screen.getAllByLabelText('What to do?')).toHaveLength(2)
    expect(screen.getAllByLabelText('What to do?')[0]).toHaveValue('Ghost born')

    await user.type(composer, 'Temporary')
    await user.clear(composer)
    expect(screen.queryByDisplayValue('Temporary')).not.toBeInTheDocument()
  })

  it('exposes named regions for status, editor, and composer', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TodoLists style={{}} />)
    await loadLists()
    await user.click(screen.getByText('First List'))

    expect(screen.getByRole('status', { name: 'Save status' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Todo editor' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'New todo' })).toBeInTheDocument()
  })
})
