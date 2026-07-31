import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TodoListForm } from './TodoListForm'
import { createTodo } from '../todoModel'

describe('TodoListForm autosave', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('persists changes after debounce without a Save button', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    const saveTodoList = jest.fn().mockResolvedValue({
      id: '0000000001',
      title: 'First List',
      todos: [],
    })
    const todoList = {
      id: '0000000001',
      title: 'First List',
      todos: [createTodo({ id: 't1', text: 'Original' })],
    }

    render(<TodoListForm todoList={todoList} saveTodoList={saveTodoList} />)

    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()
    expect(saveTodoList).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText('What to do?'))
    await user.type(screen.getByLabelText('What to do?'), 'Updated')

    await act(async () => {
      jest.advanceTimersByTime(400)
    })

    expect(saveTodoList).toHaveBeenCalledWith(
      '0000000001',
      expect.objectContaining({
        todos: [expect.objectContaining({ id: 't1', text: 'Updated' })],
      })
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(await screen.findByText('All changes saved')).toBeInTheDocument()
  })
})
