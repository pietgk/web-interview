import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TodoItem } from './TodoItem'
import { createTodo } from '../todoModel'

describe('TodoItem', () => {
  it('notifies on text, completed, due date, and delete, and shows due status in the date label', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    const onRemove = jest.fn()
    const todo = createTodo({ id: '1', text: 'Buy milk', dueDate: '2026-08-01' })
    const now = new Date(2026, 6, 31)

    render(
      <TodoItem todo={todo} onChange={onChange} onRemove={onRemove} now={now} />
    )

    expect(screen.getByLabelText('Due in 1 day: Buy milk')).toBeInTheDocument()
    expect(screen.queryByText('1 day remaining')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Todo: Buy milk' })).toBeInTheDocument()
    expect(screen.queryByText('1')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('What to do?'), '!')
    expect(onChange).toHaveBeenCalledWith({ text: 'Buy milk!' })

    await user.click(screen.getByLabelText('Mark completed: Buy milk'))
    expect(onChange).toHaveBeenCalledWith({ completed: true })

    fireEvent.change(screen.getByLabelText('Due in 1 day: Buy milk'), {
      target: { value: '2026-08-05' },
    })
    expect(onChange).toHaveBeenCalledWith({ dueDate: '2026-08-05' })

    await user.click(screen.getByLabelText('Delete todo: Buy milk'))
    expect(onRemove).toHaveBeenCalled()
  })

  it('does not describe a completed todo as overdue', () => {
    const todo = createTodo({
      id: '1',
      text: 'Done',
      completed: true,
      dueDate: '2026-07-30',
    })
    const now = new Date(2026, 6, 31)

    render(
      <TodoItem todo={todo} onChange={jest.fn()} onRemove={jest.fn()} now={now} />
    )

    expect(screen.getByLabelText('Completed: Done')).toBeInTheDocument()
    expect(screen.queryByText(/overdue/i)).not.toBeInTheDocument()
  })
})
