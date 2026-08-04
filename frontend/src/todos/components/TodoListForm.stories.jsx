import { expect, fn, userEvent } from 'storybook/test'
import { TodoListForm } from './TodoListForm'

const baseList = {
  id: 'list',
  title: 'Release',
  todos: [{ id: 'todo', text: 'Original', completed: false, dueDate: null }],
}

const meta = /** @type {import('@storybook/react-vite').Meta<typeof TodoListForm>} */ ({
  title: 'Todos/TodoListForm',
  component: TodoListForm,
  args: {
    todoList: baseList,
    composerText: '',
    onMaterialize: fn(),
    onTitleChange: fn(),
    onCancelDraft: fn(),
    send: fn(),
  },
})

export default meta

export const Populated = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoListForm>} */ ({
  play: async ({ canvas, args }) => {
    await expect(canvas.getAllByLabelText('Todo List name')).toHaveLength(1)
    await expect(canvas.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()
    await userEvent.clear(canvas.getByLabelText('What to do?'))
    await userEvent.type(canvas.getByLabelText('What to do?'), 'Updated')
    await userEvent.tab()
    await expect(args.send).toHaveBeenCalledWith({
      type: 'TODO_PATCH',
      id: 'todo',
      patch: { text: 'Updated' },
    })
  },
})

export const UnmaterializedDraft = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoListForm>} */ ({
  args: {
    draft: true,
    autoFocusTitle: true,
    todoList: { id: 'draft', title: '', todos: [] },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText('Todo List name')).toHaveFocus()
    await expect(canvas.queryByLabelText('Add a todo')).not.toBeInTheDocument()
    await expect(canvas.queryByRole('region', { name: 'Todo editor' })).not.toBeInTheDocument()
  },
})

export const TitleEnterFocusesComposer = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoListForm>} */ ({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByLabelText('Todo List name'))
    await userEvent.keyboard('{Enter}')
    await expect(canvas.getByLabelText('Add a todo')).toHaveFocus()
  },
})

export const GhostComposer = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoListForm>} */ ({
  play: async ({ canvas, args }) => {
    await userEvent.type(canvas.getByLabelText('Add a todo'), 'New')
    await expect(args.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'COMPOSER_CHANGE' })
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Add todo' }))
    await expect(args.send).toHaveBeenCalledWith({ type: 'COMPOSER_SUBMIT' })
  },
})
