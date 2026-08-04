import { expect, fn, userEvent } from 'storybook/test'
import { CompletionField } from './CompletionField'

const meta = /** @type {import('@storybook/react-vite').Meta<typeof CompletionField>} */ ({
  title: 'Todos/CompletionField',
  component: CompletionField,
  args: {
    todoLabel: 'Buy milk',
    onChange: fn(),
  },
})

export default meta

export const Incomplete = /** @type {import('@storybook/react-vite').StoryObj<typeof CompletionField>} */ ({
  args: { completed: false },
  play: async ({ canvas, args }) => {
    const checkbox = canvas.getByLabelText(`Mark completed: ${args.todoLabel}`)
    await expect(checkbox).not.toBeChecked()
    await userEvent.click(canvas.getByText('Done'))
    await expect(args.onChange).toHaveBeenCalledWith(true)
  },
})

export const Completed = /** @type {import('@storybook/react-vite').StoryObj<typeof CompletionField>} */ ({
  args: { completed: true },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByLabelText(`Mark completed: ${args.todoLabel}`)).toBeChecked()
  },
})
