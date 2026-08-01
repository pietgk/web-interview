import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TodoLists } from './TodoLists'
import * as api from '../../api/todoLists'
import { AUTOSAVE_DEBOUNCE_MS } from '../createSaveQueue'
import { createTodo } from '../todoModel'

jest.mock('../../api/todoLists')

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

describe('TodoLists persistence regressions', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    api.fetchTodoLists.mockResolvedValue(seedLists)
    api.saveTodoList.mockImplementation(async (id, { todos }) => ({
      id,
      title: seedLists[id].title,
      todos,
    }))
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.clearAllMocks()
  })

  it('flushes an edited todo when switching lists before the debounce expires', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(<TodoLists style={{}} />)

    await screen.findByText('My Todo Lists')
    await user.click(screen.getByText('First List'))

    const field = screen.getByLabelText('What to do?')
    await user.clear(field)
    await user.type(field, 'Unsaved switch test')

    expect(api.saveTodoList).not.toHaveBeenCalled()

    await user.click(screen.getByText('Second List'))

    await waitFor(() => {
      expect(api.saveTodoList).toHaveBeenCalledWith(
        '0000000001',
        expect.objectContaining({
          todos: [expect.objectContaining({ text: 'Unsaved switch test' })],
        })
      )
    })

    await user.click(screen.getByText('First List'))
    expect(screen.getByLabelText('What to do?')).toHaveValue('Unsaved switch test')
  })

  it('coalesces an edit made while a save is in flight', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const first = {}
    first.promise = new Promise((resolve) => {
      first.resolve = resolve
    })
    const second = {}
    second.promise = new Promise((resolve) => {
      second.resolve = resolve
    })

    let call = 0
    api.saveTodoList.mockImplementation(() => {
      call += 1
      return call === 1 ? first.promise : second.promise
    })

    render(<TodoLists style={{}} />)
    await screen.findByText('My Todo Lists')
    await user.click(screen.getByText('First List'))

    const field = screen.getByLabelText('What to do?')
    await user.clear(field)
    await user.type(field, 'first')
    await act(async () => {
      jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
    })

    await waitFor(() => expect(api.saveTodoList).toHaveBeenCalledTimes(1))

    await user.clear(field)
    await user.type(field, 'second')

    first.resolve({
      id: '0000000001',
      title: 'First List',
      todos: [createTodo({ id: 't1', text: 'first' })],
    })

    await waitFor(() => expect(api.saveTodoList).toHaveBeenCalledTimes(2))
    expect(api.saveTodoList).toHaveBeenLastCalledWith(
      '0000000001',
      expect.objectContaining({
        todos: [expect.objectContaining({ text: 'second' })],
      })
    )

    second.resolve({
      id: '0000000001',
      title: 'First List',
      todos: [createTodo({ id: 't1', text: 'second' })],
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByLabelText('What to do?')).toHaveValue('second')
    expect(await screen.findByText('All changes saved')).toBeInTheDocument()
  })

  it('keeps a failed draft and retries successfully', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    api.saveTodoList
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        id: '0000000001',
        title: 'First List',
        todos: [createTodo({ id: 't1', text: 'Retry me' })],
      })

    render(<TodoLists style={{}} />)
    await screen.findByText('My Todo Lists')
    await user.click(screen.getByText('First List'))

    const field = screen.getByLabelText('What to do?')
    await user.clear(field)
    await user.type(field, 'Retry me')
    await act(async () => {
      jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
    })

    expect(await screen.findByText(/Save failed: network down/)).toBeInTheDocument()
    expect(screen.getByLabelText('What to do?')).toHaveValue('Retry me')

    await user.click(screen.getByRole('button', { name: 'Retry saving todo list' }))
    expect(await screen.findByText('All changes saved')).toBeInTheDocument()
  })

  it('updates list completion from the draft while a save is pending', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const pending = {}
    pending.promise = new Promise((resolve) => {
      pending.resolve = resolve
    })
    api.saveTodoList.mockReturnValue(pending.promise)

    render(<TodoLists style={{}} />)
    await screen.findByText('My Todo Lists')
    await user.click(screen.getByText('First List'))

    await user.click(screen.getByLabelText('Mark todo 1 completed'))

    expect(screen.getByLabelText('First List completed')).toBeInTheDocument()
    expect(screen.getByText('All todos completed')).toBeInTheDocument()

    pending.resolve({
      id: '0000000001',
      title: 'First List',
      todos: [createTodo({ id: 't1', text: 'First todo of first list!', completed: true })],
    })
  })
})
