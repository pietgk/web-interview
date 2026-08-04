import { expect, fn, screen, userEvent } from 'storybook/test'
import DeleteTodoListDialog from './DeleteTodoListDialog'

const meta = /** @type {import('@storybook/react-vite').Meta<typeof DeleteTodoListDialog>} */ ({
  title: 'Todos/DeleteTodoListDialog',
  component: DeleteTodoListDialog,
  args: {
    onCancel: fn(),
    onConfirm: fn(),
  },
})

export default meta

export const OneTodo = /** @type {import('@storybook/react-vite').StoryObj<typeof DeleteTodoListDialog>} */ ({
  args: {
    todoList: {
      id: 'list',
      title: 'First List',
      todos: [{ id: 'todo', text: 'Buy milk', completed: false, dueDate: null }],
    },
  },
  play: async ({ args }) => {
    await expect(screen.getByRole('dialog', { name: 'Delete First List?' })).toHaveTextContent(
      '1 Todo will also disappear.'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await expect(args.onCancel).toHaveBeenCalled()
  },
})

export const MultipleTodos = /** @type {import('@storybook/react-vite').StoryObj<typeof DeleteTodoListDialog>} */ ({
  args: {
    todoList: {
      id: 'list',
      title: 'Errands',
      todos: [
        { id: 'a', text: 'A', completed: false, dueDate: null },
        { id: 'b', text: 'B', completed: true, dueDate: null },
      ],
    },
  },
  play: async ({ args }) => {
    await expect(screen.getByRole('dialog', { name: 'Delete Errands?' })).toHaveTextContent(
      '2 Todos will also disappear.'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Delete Todo List' }))
    await expect(args.onConfirm).toHaveBeenCalled()
  },
})
