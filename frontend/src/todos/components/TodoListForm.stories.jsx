import { useState } from 'react'
import { expect, fn, userEvent } from 'storybook/test'
import { TodoListForm } from './TodoListForm'

/** @param {string} story */
const storyDocs = (story) => ({
  parameters: {
    docs: {
      description: { story },
    },
  },
})

const baseList = {
  id: 'list',
  title: 'Release',
  todos: [{ id: 'todo', text: 'Original', completed: false, dueDate: null }],
}

/**
 * Keeps composerText in sync so typing accumulates (args alone stay at `''`).
 *
 * @param {import('react').ComponentProps<typeof TodoListForm>} props
 */
const StatefulComposerForm = (props) => {
  const [composerText, setComposerText] = useState(props.composerText ?? '')
  return (
    <TodoListForm
      {...props}
      composerText={composerText}
      send={(event) => {
        props.send(event)
        if (event.type === 'COMPOSER_CHANGE') setComposerText(event.text ?? '')
      }}
    />
  )
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
  parameters: {
    docs: {
      description: {
        component: [
          '**TodoListForm** is the active-list card: title field plus, when not a draft, the **Todo editor** (composer + Todo rows). It maps UI events through `send` / title callbacks — it does not own the datom client.',
          '**Draft** (`draft`): section **New Todo List**, title only — no composer/editor until the list materializes. **Populated**: section `Todo List: {title}`, Enter in the title focuses the composer (`onAccept`). Title-field settle/escape details live under TodoListTitleField; row/composer details under TodoItem / TodoComposer.',
        ].join('\n\n'),
      },
    },
  },
})

export default meta

export const Populated = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoListForm>} */ ({
  ...storyDocs([
    '**Why:** A materialized list must expose title + editor and route Todo patches through `send`.',
    '**See:** Section Todo List: Release with Todo editor; settling What to do? to Updated sends TODO_PATCH; delete sends TODO_REMOVE.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole('region', { name: 'Todo List: Release' })).toBeInTheDocument()
    await expect(canvas.getByRole('region', { name: 'Todo editor' })).toBeInTheDocument()
    await expect(canvas.getAllByLabelText('Todo List name')).toHaveLength(1)

    await userEvent.clear(canvas.getByLabelText('What to do?'))
    await userEvent.type(canvas.getByLabelText('What to do?'), 'Updated')
    await userEvent.tab()
    await expect(args.send).toHaveBeenCalledWith({
      type: 'TODO_PATCH',
      id: 'todo',
      patch: { text: 'Updated' },
    })

    await userEvent.click(canvas.getByLabelText('Delete todo: Original'))
    await expect(args.send).toHaveBeenCalledWith({ type: 'TODO_REMOVE', id: 'todo' })
  },
})

export const UnmaterializedDraft = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoListForm>} */ ({
  args: {
    draft: true,
    autoFocusTitle: true,
    todoList: { id: 'draft', title: '', todos: [] },
  },
  ...storyDocs([
    '**Why:** A draft list is title-only until it materializes — no editor chrome yet.',
    '**See:** Section New Todo List, title focused; no Add a todo and no Todo editor region.',
  ].join(' ')),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('region', { name: 'New Todo List' })).toBeInTheDocument()
    await expect(canvas.getByLabelText('Todo List name')).toHaveFocus()
    await expect(canvas.queryAllByLabelText('Add a todo')).toHaveLength(0)
    await expect(canvas.queryAllByRole('region', { name: 'Todo editor' })).toHaveLength(0)
  },
})

export const TitleEnterFocusesComposer = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoListForm>} */ ({
  ...storyDocs([
    '**Why:** Accepting the title (Enter) should move focus into the ghost composer for the next Todo.',
    '**See:** Enter in Todo List name focuses Add a todo.',
  ].join(' ')),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByLabelText('Todo List name'))
    await userEvent.keyboard('{Enter}')
    await expect(canvas.getByLabelText('Add a todo')).toHaveFocus()
  },
})

export const GhostComposer = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoListForm>} */ ({
  render: (args) => <StatefulComposerForm {...args} />,
  ...storyDocs([
    '**Why:** Composer keystrokes and plus/Enter must reach the parent as COMPOSER_* events via `send`.',
    '**See:** Typing accumulates and sends COMPOSER_CHANGE ending in `New`; Add todo sends COMPOSER_SUBMIT. (Story keeps composer text stateful so the controlled field can accumulate.)',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    await userEvent.type(canvas.getByLabelText('Add a todo'), 'New')
    await expect(args.send).toHaveBeenCalledWith({ type: 'COMPOSER_CHANGE', text: 'New' })
    await userEvent.click(canvas.getByRole('button', { name: 'Add todo' }))
    await expect(args.send).toHaveBeenCalledWith({ type: 'COMPOSER_SUBMIT' })
  },
})
