import { expect, fn, userEvent } from 'storybook/test'
import { TodoListTitleField } from './TodoListTitleField'

const meta = /** @type {import('@storybook/react-vite').Meta<typeof TodoListTitleField>} */ ({
  title: 'Todos/TodoListTitleField',
  component: TodoListTitleField,
  args: {
    onMaterialize: fn(),
    onTitleChange: fn(),
    onCancelDraft: fn(),
    onAccept: fn(),
  },
})

export default meta

export const BlankDraft = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoListTitleField>} */ ({
  args: {
    title: '',
    draft: true,
  },
  play: async ({ canvas, args }) => {
    const field = canvas.getByLabelText('Todo List name')
    await userEvent.type(field, '  Release')
    await expect(args.onMaterialize).not.toHaveBeenCalled()
    await userEvent.tab()
    await expect(args.onMaterialize).toHaveBeenCalledTimes(1)
    await expect(args.onMaterialize).toHaveBeenCalledWith('Release')
  },
})

export const SavedTitle = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoListTitleField>} */ ({
  args: {
    title: 'Release',
  },
  play: async ({ canvas, args }) => {
    const field = canvas.getByLabelText('Todo List name')
    await userEvent.clear(field)
    await expect(canvas.getByText('Todo List name is required')).toBeInTheDocument()
    await expect(args.onTitleChange).not.toHaveBeenCalledWith('')
    await userEvent.tab()
    await expect(field).toHaveValue('Release')
    await expect(args.onAccept).not.toHaveBeenCalled()
  },
})

export const RenameOnEnterAndEscape = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoListTitleField>} */ ({
  args: {
    title: 'Release',
  },
  play: async ({ canvas, args }) => {
    const field = canvas.getByLabelText('Todo List name')
    await userEvent.clear(field)
    await userEvent.type(field, '  Renamed  {Enter}')
    await expect(args.onTitleChange).toHaveBeenLastCalledWith('Renamed')
    await expect(args.onAccept).toHaveBeenCalledTimes(1)

    // Escape restores the current saved title prop after a temporary edit.
    await userEvent.clear(field)
    await userEvent.type(field, 'Temporary{Escape}')
    await expect(field).toHaveValue('Release')
  },
})
