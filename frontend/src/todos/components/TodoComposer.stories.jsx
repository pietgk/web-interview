import { expect, fn, userEvent } from 'storybook/test'
import { TODO_TEXT_MAX_LENGTH } from '@web-interview/todos/protocol'
import { TodoComposer } from './TodoComposer'

/** @param {string} story */
const storyDocs = (story) => ({
  parameters: {
    docs: {
      description: { story },
    },
  },
})

const meta = /** @type {import('@storybook/react-vite').Meta<typeof TodoComposer>} */ ({
  title: 'Todos/TodoComposer',
  component: TodoComposer,
  args: {
    text: '',
    onChange: fn(),
    onSubmit: fn(),
    onCommit: fn(),
  },
  parameters: {
    docs: {
      description: {
        component: [
          '**TodoComposer** is the ghost “Add a todo” row: typed text stays local until the parent settles it into a Todo. **Enter** or the **Add todo** plus button call `onSubmit`; focus returns to the input after plus. Leaving the row (blur outside the group) calls `onCommit`.',
          'It is only the composer — not a TodoItem — so there is no Done/due/delete chrome. Plays assert the New todo group, callbacks, and focus; they do not assert the absence of other components.',
        ].join('\n\n'),
      },
    },
  },
})

export default meta

export const Empty = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoComposer>} */ ({
  ...storyDocs([
    '**Why:** An empty composer must accept typing, submit via Enter or plus, and keep focus on the field after plus.',
    '**See:** Group New todo, empty Add a todo; typing calls `onChange`; Enter and Add todo each call `onSubmit`; after plus, Add a todo is focused.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole('group', { name: 'New todo' })).toBeInTheDocument()
    const field = canvas.getByLabelText('Add a todo')
    await expect(field).toHaveValue('')
    await expect(field).toHaveAttribute('maxlength', String(TODO_TEXT_MAX_LENGTH))
    await expect(canvas.getByRole('button', { name: 'Add todo' })).toBeInTheDocument()

    await userEvent.type(field, 'A')
    await expect(args.onChange).toHaveBeenCalledWith('A')

    await userEvent.keyboard('{Enter}')
    await expect(args.onSubmit).toHaveBeenCalledTimes(1)

    await userEvent.click(canvas.getByRole('button', { name: 'Add todo' }))
    await expect(args.onSubmit).toHaveBeenCalledTimes(2)
    await expect(field).toHaveFocus()
  },
})

export const WithDraftText = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoComposer>} */ ({
  args: { text: 'Buy milk' },
  ...storyDocs([
    '**Why:** In-progress composer text from the parent must show in the field until submit/settle.',
    '**See:** Add a todo shows Buy milk; Add todo calls `onSubmit` once and returns focus to the field.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    const field = canvas.getByLabelText('Add a todo')
    await expect(field).toHaveValue('Buy milk')
    await userEvent.click(canvas.getByRole('button', { name: 'Add todo' }))
    await expect(args.onSubmit).toHaveBeenCalledTimes(1)
    await expect(field).toHaveFocus()
  },
})

export const CommitOnBlur = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoComposer>} */ ({
  args: { text: 'Buy milk' },
  ...storyDocs([
    '**Why:** Leaving the composer row must commit (settle) without requiring Enter — same as tabbing away in the app.',
    '**See:** Focus the field, then move to Outside; `onCommit` fires once. `onSubmit` does not.',
  ].join(' ')),
  render: (args) => (
    <>
      <TodoComposer {...args} />
      <button type='button'>Outside</button>
    </>
  ),
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByLabelText('Add a todo'))
    await userEvent.click(canvas.getByRole('button', { name: 'Outside' }))
    await expect(args.onCommit).toHaveBeenCalledTimes(1)
    await expect(args.onSubmit).not.toHaveBeenCalled()
  },
})
