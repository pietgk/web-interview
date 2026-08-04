import { expect, fn, fireEvent, userEvent } from 'storybook/test'
import { TodoItem } from './TodoItem'

const now = new Date(2026, 6, 31)

/** @param {Partial<import('@web-interview/todos/types').Todo>} [overrides] */
const createTodo = (overrides = {}) => ({
  id: '1',
  text: '',
  completed: false,
  dueDate: null,
  ...overrides,
})

const meta = /** @type {import('@storybook/react-vite').Meta<typeof TodoItem>} */ ({
  title: 'Todos/TodoItem',
  component: TodoItem,
  args: {
    onChange: fn(),
    onRemove: fn(),
    now,
  },
})

export default meta

export const ActiveWithDueDate = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoItem>} */ ({
  args: {
    todo: createTodo({ id: '1', text: 'Buy milk', dueDate: '2026-08-01' }),
  },
  play: async ({ canvas, args }) => {
    const label = args.todo.text
    await expect(canvas.getByLabelText(`Due in 1 day: ${label}`)).toBeInTheDocument()
    await expect(canvas.queryByText('1 day remaining')).not.toBeInTheDocument()
    await expect(canvas.getByRole('group', { name: `Todo: ${label}` })).toBeInTheDocument()

    await userEvent.type(canvas.getByLabelText('What to do?'), '!')
    await expect(args.onChange).not.toHaveBeenCalledWith({ text: `${label}!` })
    await userEvent.tab()
    await expect(args.onChange).toHaveBeenCalledWith({ text: `${label}!` })

    await userEvent.click(canvas.getByLabelText(`Mark completed: ${label}`))
    await expect(args.onChange).toHaveBeenCalledWith({ completed: true })

    fireEvent.change(canvas.getByLabelText(`Due in 1 day: ${label}`), {
      target: { value: '2026-08-05' },
    })
    await expect(args.onChange).toHaveBeenCalledWith({ dueDate: '2026-08-05' })

    await userEvent.click(canvas.getByLabelText(`Delete todo: ${label}`))
    await expect(args.onRemove).toHaveBeenCalled()
  },
})

export const CompletedNotOverdue = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoItem>} */ ({
  args: {
    todo: createTodo({
      id: '1',
      text: 'Done',
      completed: true,
      dueDate: '2026-07-30',
    }),
  },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByLabelText(`Due date: ${args.todo.text}`)).toBeInTheDocument()
    await expect(canvas.queryByText(/overdue/i)).not.toBeInTheDocument()
  },
})
