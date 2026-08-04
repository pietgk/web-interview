import { expect, fn, userEvent } from 'storybook/test'
import { TodoComposer } from './TodoComposer'

const meta = /** @type {import('@storybook/react-vite').Meta<typeof TodoComposer>} */ ({
  title: 'Todos/TodoComposer',
  component: TodoComposer,
  args: {
    text: '',
    onChange: fn(),
    onSubmit: fn(),
  },
})

export default meta

export const Empty = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoComposer>} */ ({
  play: async ({ canvas, args }) => {
    await expect(canvas.getByLabelText('Add a todo')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Add todo' })).toBeInTheDocument()
    await expect(canvas.queryByLabelText(/Mark completed/)).not.toBeInTheDocument()
    await expect(canvas.queryByLabelText(/Delete todo/)).not.toBeInTheDocument()

    await userEvent.type(canvas.getByLabelText('Add a todo'), 'A')
    await expect(args.onChange).toHaveBeenCalledWith('A')

    await userEvent.keyboard('{Enter}')
    await expect(args.onSubmit).toHaveBeenCalled()

    await userEvent.click(canvas.getByRole('button', { name: 'Add todo' }))
    await expect(args.onSubmit).toHaveBeenCalledTimes(2)
    await expect(canvas.getByLabelText('Add a todo')).toHaveFocus()
  },
})

export const WithDraftText = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoComposer>} */ ({
  args: { text: 'Buy milk' },
})
