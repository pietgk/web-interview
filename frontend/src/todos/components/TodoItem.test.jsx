import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TodoItem } from './TodoItem'
import { createTodo } from '../todoModel'

describe('TodoItem', () => {
  it('notifies on text, completed, and delete, and shows due status', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    const onRemove = jest.fn()
    const todo = createTodo({ id: '1', text: 'Buy milk', dueDate: '2026-08-01' })
    const now = new Date(2026, 6, 31)

    render(
      <TodoItem todo={todo} index={0} onChange={onChange} onRemove={onRemove} now={now} />
    )

    expect(screen.getByText('1 day remaining')).toBeInTheDocument()

    await user.type(screen.getByLabelText('What to do?'), '!')
    expect(onChange).toHaveBeenCalled()

    await user.click(screen.getByLabelText('Mark todo 1 completed'))
    expect(onChange).toHaveBeenCalledWith({ completed: true })

    await user.click(screen.getByLabelText('Delete todo 1'))
    expect(onRemove).toHaveBeenCalled()
  })
})
