import {
  act,
  render,
  screen,
  waitFor,
  waitForElementToBeRemoved,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { within } from '@testing-library/react'
import {
  applyTransaction,
  databaseFromReadModel,
  projectTodoLists,
} from '@web-interview/todos/database'
import { SYNC_DEBOUNCE_MS } from '@web-interview/todos/actor'
import { TodoLists } from './TodoLists'
import { useTodoLists } from '../useTodoLists'
import * as api from '../../api/todoLists'
import { createTodo } from '../todoModel'

/** @typedef {import('@web-interview/todos/types').TodoDatabase} TodoDatabase */
/** @typedef {import('@web-interview/todos/types').TodoLists} TodoListReadModel */

vi.mock('../../api/todoLists', () => ({
  fetchTodoReadModel: vi.fn(),
  syncTodoLists: vi.fn(),
}))

const fetchTodoReadModelMock = vi.mocked(api.fetchTodoReadModel)
const syncTodoListsMock = vi.mocked(api.syncTodoLists)

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

/** @type {TodoDatabase} */
let serverDatabase

/** @param {TodoListReadModel} [todoLists] */
const installServer = (todoLists = seedLists) => {
  serverDatabase = databaseFromReadModel(todoLists, 1)
  fetchTodoReadModelMock.mockImplementation(async () => ({
    basis: serverDatabase.basis,
    todoLists: projectTodoLists(serverDatabase),
  }))
  syncTodoListsMock.mockImplementation(async ({ transactions }) => {
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

const TodoListsHarness = () => {
  const runtime = useTodoLists()
  return <TodoLists runtime={runtime} style={{}} />
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

    render(<TodoListsHarness />)
    await loadLists()

    expect(screen.getByText('0 of 1 completed')).toBeInTheDocument()
    expect(screen.getByText('No todos yet')).toBeInTheDocument()
  })

  it('applies edits optimistically and synchronizes a transaction batch', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TodoListsHarness />)
    await loadLists()
    await user.click(screen.getByText('First List'))

    const field = screen.getByLabelText('What to do?')
    await user.clear(field)
    await user.type(field, 'Synced edit')

    expect(field).toHaveValue('Synced edit')
    expect(api.syncTodoLists).not.toHaveBeenCalled()
    await advanceAutosave()

    await waitFor(() => expect(api.syncTodoLists).toHaveBeenCalledTimes(1))
    expect(field).toHaveValue('Synced edit')
  })

  it('flushes pending transactions when focus leaves the editor', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TodoListsHarness />)
    await loadLists()
    await user.click(screen.getByText('First List'))
    await user.clear(screen.getByLabelText('What to do?'))
    await user.type(screen.getByLabelText('What to do?'), 'Switch now')

    await user.click(screen.getByText('Second List'))

    await waitFor(() => expect(api.syncTodoLists).toHaveBeenCalledTimes(1))
    await user.click(screen.getByText('First List'))
    expect(screen.getByLabelText('What to do?')).toHaveValue('Switch now')
  })

  it('updates list completion before server acknowledgement', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    /** @type {((value: Awaited<ReturnType<typeof api.syncTodoLists>>) => void) | undefined} */
    let resolveSync
    syncTodoListsMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveSync = resolve })
    )
    render(<TodoListsHarness />)
    await loadLists()
    await user.click(screen.getByText('First List'))

    await user.click(screen.getByLabelText('Mark completed: First todo of first list!'))

    expect(screen.getByText('1 of 1 completed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^First List / })).toHaveAttribute(
      'aria-current',
      'true'
    )

    await advanceAutosave()
    expect(syncTodoListsMock).toHaveBeenCalledTimes(1)
    const completeSync = resolveSync
    if (!completeSync) throw new Error('Expected pending sync request')
    await act(async () => {
      completeSync({
        basis: 1,
        todoLists: seedLists,
        acceptedTransactionIds: [],
        rejectedTransactions: [],
      })
      await Promise.resolve()
    })
  })

  it('materializes, commits, and dematerializes the ghost composer', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TodoListsHarness />)
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

  it('exposes named regions for the editor and composer', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TodoListsHarness />)
    await loadLists()
    await user.click(screen.getByText('First List'))

    expect(screen.getByRole('region', { name: 'Todo editor' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'New todo' })).toBeInTheDocument()
  })

  it('creates one focused blank draft and materializes it on first text', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<TodoListsHarness />)
    await loadLists()

    const add = screen.getByRole('button', { name: 'Add Todo List' })
    await user.click(add)
    expect(screen.getByLabelText('Todo List name')).toHaveFocus()
    expect(screen.queryByLabelText('Add a todo')).not.toBeInTheDocument()
    await user.click(add)
    expect(screen.getByLabelText('Todo List name')).toHaveFocus()
    expect(screen.getAllByLabelText('Todo List name')).toHaveLength(1)

    await user.type(screen.getByLabelText('Todo List name'), 'Release')
    expect(screen.getByLabelText('Add a todo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Release No todos yet$/ })).toHaveAttribute(
      'aria-current',
      'true'
    )
  })

  it('deletes empty lists immediately and confirms a non-empty final list', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    installServer({
      '0000000001': seedLists['0000000001'],
      '0000000002': { ...seedLists['0000000002'], todos: [] },
    })
    render(<TodoListsHarness />)
    await loadLists()

    await user.click(screen.getByRole('button', {
      name: 'Delete Todo List: Second List',
    }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Second List')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', {
      name: 'Delete Todo List: First List',
    }))
    expect(screen.getByRole('dialog', { name: 'Delete First List?' })).toHaveTextContent(
      '1 Todo will also disappear.'
    )
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitForElementToBeRemoved(() => screen.queryByRole('dialog'))
    expect(screen.getByText('First List')).toBeInTheDocument()

    await user.click(screen.getByRole('button', {
      name: 'Delete Todo List: First List',
    }))
    await user.click(screen.getByRole('button', { name: 'Delete Todo List' }))
    expect(screen.queryByText('First List')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', {
      name: 'Add Todo List',
    })).toHaveFocus())
  })

  it('re-sorts from optimistic due dates without losing active selection', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    installServer({
      '0000000001': {
        ...seedLists['0000000001'],
        todos: [{ ...seedLists['0000000001'].todos[0], dueDate: '2099-02-01' }],
      },
      '0000000002': {
        ...seedLists['0000000002'],
        todos: [{ ...seedLists['0000000002'].todos[0], dueDate: '2099-01-01' }],
      },
    })
    render(<TodoListsHarness />)
    await loadLists()

    const list = screen.getByRole('list', { name: 'Todo lists' })
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Second List')
    await user.click(screen.getByText('First List'))
    const dueDate = screen.getByDisplayValue('2099-02-01')
    await user.clear(dueDate)
    await user.type(dueDate, '2098-01-01')

    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('First List')
    expect(screen.getByRole('button', { name: /^First List / })).toHaveAttribute(
      'aria-current',
      'true'
    )
  })
})
