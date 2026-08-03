import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ATTRIBUTE } from '@web-interview/todos/datom'
import {
  SAVING_INDICATOR_DELAY_MS,
  TEXT_SETTLE_MS,
} from '@web-interview/todos/protocol'
import { listId, todoId, ulid } from '@web-interview/todos/ulid'
import { createFakeDatomServer } from '../../testing/fakeDatomServer'
import { StatusBar } from './StatusBar'
import { TodoLists } from './TodoLists'
import { createTodoClient } from '../todoClient'
import { useTodoLists } from '../useTodoLists'

/** @typedef {import('@web-interview/todos/types').Datom} Datom */

/** @type {ReturnType<typeof createFakeDatomServer>} */
let server
let clock = 1_760_000_000_000

const at = () => (clock += 1)

const FIRST_LIST = listId(at())
const FIRST_TODO = todoId(FIRST_LIST, at())
const SECOND_LIST = listId(at())
const SECOND_TODO = todoId(SECOND_LIST, at())

/** @returns {Datom[]} */
const seedDatoms = () => [
  [FIRST_LIST, ATTRIBUTE.TITLE, 'First List', ulid(at()), true],
  [FIRST_TODO, ATTRIBUTE.TEXT, 'First todo of first list!', ulid(at()), true],
  [SECOND_LIST, ATTRIBUTE.TITLE, 'Second List', ulid(at()), true],
  [SECOND_TODO, ATTRIBUTE.TEXT, 'First todo of second list!', ulid(at()), true],
]

const Harness = () => {
  const runtime = useTodoLists({
    createClient: () =>
      createTodoClient({
        apiBase: '',
        EventSourceImpl: /** @type {typeof EventSource} */ (
          /** @type {unknown} */ (server.FakeEventSource)
        ),
        fetchImpl: server.fetchImpl,
      }),
  })
  return (
    <>
      <StatusBar runtime={runtime} />
      <TodoLists runtime={runtime} style={{}} />
    </>
  )
}

/** Lets the stream open, deliver the compacted set, and hand over server time. */
const connect = async () => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Add Todo List' })).toBeEnabled()
  )
}

const settle = async () => {
  await act(async () => {
    vi.advanceTimersByTime(TEXT_SETTLE_MS)
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('TodoLists over the datom log', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    server = createFakeDatomServer()
    server.seed(seedDatoms())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('summarizes incomplete and empty Todo Lists from the projected read model', async () => {
    server.push([[SECOND_TODO, ATTRIBUTE.TEXT, 'First todo of second list!', ulid(at()), false]])
    render(<Harness />)
    await connect()

    expect(screen.getByText('0 of 1 completed')).toBeInTheDocument()
    expect(screen.getByText('No todos yet')).toBeInTheDocument()
  })

  it('disables editing until the first server time arrives', async () => {
    server.disconnect()
    render(<Harness />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByRole('button', { name: 'Add Todo List' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Connection lost')
  })

  it('keeps editing enabled after the stream drops', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<Harness />)
    await connect()
    await user.click(screen.getByText('First List'))

    act(() => server.disconnect())

    expect(screen.getByRole('button', { name: 'Add Todo List' })).toBeEnabled()
    const field = screen.getByLabelText('What to do?')
    await user.clear(field)
    await user.type(field, 'Written while offline')
    await settle()

    expect(field).toHaveValue('Written while offline')
    expect(screen.getByRole('alert')).toHaveTextContent('Waiting for connection')
  })

  it('mints one datom when a text edit settles, not one per keystroke', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const posted = vi.spyOn(server, 'fetchImpl')
    render(<Harness />)
    await connect()
    await user.click(screen.getByText('First List'))

    const field = screen.getByLabelText('What to do?')
    await user.clear(field)
    await user.type(field, 'Settled once')
    expect(posted).not.toHaveBeenCalled()

    await settle()

    await waitFor(() => expect(posted).toHaveBeenCalledTimes(1))
    const { datoms } = JSON.parse(String(posted.mock.calls[0][1]?.body))
    expect(datoms).toEqual([[FIRST_TODO, ATTRIBUTE.TEXT, 'Settled once', expect.any(String), true]])
    expect(server.store.readModel()[FIRST_LIST].todos[0].text).toBe('Settled once')
  })

  it('does not say Saving before the outbox has been busy for 300ms', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    /** @type {(() => void) | undefined} */
    let releasePost
    vi.spyOn(server, 'fetchImpl').mockImplementation(
      () => new Promise((resolve) => {
        releasePost = () => resolve(/** @type {Response} */ (/** @type {unknown} */ ({
          ok: true,
          status: 200,
          json: async () => ({ serverTime: server.serverTime() }),
        })))
      })
    )
    render(<Harness />)
    await connect()
    await user.click(screen.getByText('First List'))
    await user.type(screen.getByLabelText('What to do?'), '!')
    await settle()

    expect(screen.getByRole('status')).toHaveTextContent('All changes saved')

    await act(async () => {
      vi.advanceTimersByTime(SAVING_INDICATOR_DELAY_MS)
      await Promise.resolve()
    })
    expect(screen.getByRole('status')).toHaveTextContent('Saving…')

    await act(async () => {
      releasePost?.()
      await Promise.resolve()
      await Promise.resolve()
    })
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('All changes saved')
    )
  })

  it('shows a Todo written by another client without any interaction', async () => {
    render(<Harness />)
    await connect()

    act(() => {
      server.push([[todoId(FIRST_LIST, at()), ATTRIBUTE.TEXT, 'From another tab', ulid(at()), true]])
    })

    expect(await screen.findByText('0 of 2 completed')).toBeInTheDocument()
  })

  it('updates list completion straight from the local projection', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<Harness />)
    await connect()
    await user.click(screen.getByText('First List'))

    await user.click(screen.getByLabelText('Mark completed: First todo of first list!'))

    expect(screen.getByText('1 of 1 completed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^First List / })).toHaveAttribute(
      'aria-current',
      'true'
    )
  })

  it('materializes, commits, and dematerializes the ghost composer', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<Harness />)
    await connect()
    await user.click(screen.getByText('First List'))

    const composer = screen.getByLabelText('Add a todo')
    await user.type(composer, 'Ghost born')
    expect(screen.getAllByLabelText('What to do?')).toHaveLength(1)
    await settle()
    expect(screen.getAllByLabelText('What to do?')).toHaveLength(1)

    await user.keyboard('{Enter}')
    expect(screen.getAllByLabelText('What to do?')).toHaveLength(2)
    expect(screen.getAllByLabelText('What to do?')[0]).toHaveValue('Ghost born')

    await user.type(composer, 'Temporary')
    await settle()
    await user.clear(composer)
    await settle()
    expect(screen.queryByDisplayValue('Temporary')).not.toBeInTheDocument()
  })

  it('exposes named regions for the editor and composer', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<Harness />)
    await connect()
    await user.click(screen.getByText('First List'))

    expect(screen.getByRole('region', { name: 'Todo editor' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'New todo' })).toBeInTheDocument()
  })

  it('creates one focused blank draft and materializes it when the title settles', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<Harness />)
    await connect()

    const add = screen.getByRole('button', { name: 'Add Todo List' })
    await user.click(add)
    expect(screen.getByLabelText('Todo List name')).toHaveFocus()
    expect(screen.queryByLabelText('Add a todo')).not.toBeInTheDocument()
    await user.click(add)
    expect(screen.getByLabelText('Todo List name')).toHaveFocus()
    expect(screen.getAllByLabelText('Todo List name')).toHaveLength(1)

    await user.type(screen.getByLabelText('Todo List name'), 'Release')
    expect(screen.queryByLabelText('Add a todo')).not.toBeInTheDocument()
    await settle()

    expect(screen.getByLabelText('Add a todo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Release No todos yet$/ })).toHaveAttribute(
      'aria-current',
      'true'
    )
  })

  it('deletes an empty Todo List immediately and confirms a populated one', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    server.push([[SECOND_TODO, ATTRIBUTE.TEXT, 'First todo of second list!', ulid(at()), false]])
    render(<Harness />)
    await connect()

    await user.click(screen.getByRole('button', {
      name: 'Delete Todo List: Second List',
    }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Second List')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', {
      name: 'Delete Todo List: First List',
    }))
    expect(await screen.findByRole('dialog', { name: 'Delete First List?' })).toHaveTextContent(
      '1 Todo will also disappear.'
    )
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
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

  it('re-sorts on a due date without losing the active selection', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    server.push([
      [FIRST_TODO, ATTRIBUTE.DUE_DATE, '2099-02-01', ulid(at()), true],
      [SECOND_TODO, ATTRIBUTE.DUE_DATE, '2099-01-01', ulid(at()), true],
    ])
    render(<Harness />)
    await connect()

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
