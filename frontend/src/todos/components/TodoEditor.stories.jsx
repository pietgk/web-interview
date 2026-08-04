import { expect } from 'storybook/test'
import { TodoComposer } from './TodoComposer'
import { TodoEditor } from './TodoEditor'
import { TodoItem } from './TodoItem'

const meta = /** @type {import('@storybook/react-vite').Meta<typeof TodoEditor>} */ ({
  title: 'Todos/TodoEditor',
  component: TodoEditor,
})

export default meta

export const WithComposerAndTodo = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoEditor>} */ ({
  args: {
    children: (
      <>
        <TodoComposer text='' onChange={() => {}} onSubmit={() => {}} />
        <TodoItem
          todo={{ id: '1', text: 'Buy milk', completed: false, dueDate: null }}
          onChange={() => {}}
          onRemove={() => {}}
        />
      </>
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('region', { name: 'Todo editor' })).toBeInTheDocument()
    await expect(canvas.getByRole('group', { name: 'New todo' })).toBeInTheDocument()
    await expect(canvas.getByRole('group', { name: 'Todo: Buy milk' })).toBeInTheDocument()
  },
})
