import { expect, fn, userEvent } from 'storybook/test'
import { TodoListForm } from './TodoListForm'

const FORM_SCENARIO_DAY = '2026-07-31'

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
 * A stand-in for `todoListCommands`. `addTodo` answers with an id because the
 * ghost composer links to whatever it minted.
 */
const fakeCommands = () => ({
  reserveListId: fn(() => 'list'),
  renameList: fn(),
  deleteList: fn(),
  addTodo: fn(() => 'new-todo'),
  retitleTodo: fn(),
  setTodoCompleted: fn(),
  setTodoDueDate: fn(),
  deleteTodo: fn(),
})

const meta = /** @type {import('@storybook/react-vite').Meta<typeof TodoListForm>} */ ({
  title: 'Todos/TodoListForm',
  component: TodoListForm,
  args: {
    todoList: baseList,
    today: FORM_SCENARIO_DAY,
    onMaterialize: fn(),
    onTitleChange: fn(),
    onCancelDraft: fn(),
  },
  // Fresh spies per story, so one play cannot see another's calls.
  loaders: [() => ({ commands: fakeCommands() })],
  render: (args, { loaded }) => <TodoListForm {...args} commands={loaded.commands} />,
  parameters: {
    docs: {
      description: {
        component: [
          '**TodoListForm** is the active-list card: title field plus, when not a draft, the **Todo editor** (composer + Todo rows). It owns the **ghost composer** through `useGhostComposer`, and reaches the model only through named **commands** (ADR 007) — never through datoms.',
          '**Draft** (`draft`): section **New Todo List**, title only — no composer/editor until the list materializes. **Populated**: section `Todo List: {title}`, Enter in the title focuses the composer (`onAccept`). Title-field settle/escape details live under TodoListTitleField; row/composer details under TodoItem / TodoComposer.',
        ].join('\n\n'),
      },
    },
  },
})

export default meta

export const Populated = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoListForm>} */ ({
  ...storyDocs([
    '**Why:** A materialized list must expose title + editor and turn Todo edits into commands.',
    '**See:** Section Todo List: Release with Todo editor; settling What to do? to Updated calls `retitleTodo`; delete calls `deleteTodo`.',
  ].join(' ')),
  play: async ({ canvas, loaded }) => {
    await expect(canvas.getByRole('region', { name: 'Todo List: Release' })).toBeInTheDocument()
    await expect(canvas.getByRole('region', { name: 'Todo editor' })).toBeInTheDocument()
    await expect(canvas.getAllByLabelText('Todo List name')).toHaveLength(1)

    await userEvent.clear(canvas.getByLabelText('What to do?'))
    await userEvent.type(canvas.getByLabelText('What to do?'), 'Updated')
    await userEvent.tab()
    await expect(loaded.commands.retitleTodo).toHaveBeenCalledWith(
      baseList.todos[0],
      'Updated'
    )

    await userEvent.click(canvas.getByLabelText('Delete todo: Original'))
    await expect(loaded.commands.deleteTodo).toHaveBeenCalledWith(baseList.todos[0])
  },
})

/** Left edge of a field's outlined box, which is what the eye reads as a column. */
const leftEdgeOf = (/** @type {HTMLElement} */ input) =>
  Math.round(
    /** @type {HTMLElement} */ (input.closest('.MuiFormControl-root'))
      .getBoundingClientRect().left
  )

/**
 * Both fields share a left edge in either layout - indented together on the
 * grid, or stacked together at the row's edge once it wraps. Only the offset
 * from the row itself tells the two apart, so every assertion below needs it.
 */
const composerIndent = (
  /** @type {ReturnType<typeof import('storybook/test').within>} */ canvas
) => {
  const row = canvas.getByRole('group', { name: 'New todo' })
  return leftEdgeOf(canvas.getByLabelText('Add a todo')) - Math.round(row.getBoundingClientRect().left)
}

export const ColumnsAlignOnDesktop = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoListForm>} */ ({
  globals: { viewport: { value: 'desktop' } },
  ...storyDocs([
    '**Why:** The composer fills only the `text` slot of a Todo row, so its field has to land on the same column as the text of every Todo beneath it. Before `TodoRow` owned placement these two started 272px apart.',
    '**See:** At desktop width, Add a todo shares a left edge with What to do?, and both sit in from the row’s own edge — the completion and due-date columns are being held open.',
  ].join(' ')),
  play: async ({ canvas }) => {
    await expect(
      leftEdgeOf(canvas.getByLabelText('Add a todo')),
      'the composer and the Todo text field are no longer on one column'
    ).toBe(leftEdgeOf(canvas.getByLabelText('What to do?')))

    await expect(
      composerIndent(canvas),
      'the composer is at the row’s edge, so the leading columns are not held'
    ).toBeGreaterThan(0)
  },
})

export const RowWrapsOnMobile = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoListForm>} */ ({
  globals: { viewport: { value: 'mobile1' } },
  ...storyDocs([
    '**Why:** Four columns cannot fit a phone, so below `sm` the row drops back to the wrapping flex layout it has always used. The column grid must not be what makes the row unusable on mobile.',
    '**See:** At 320px the composer starts at the row’s own edge — no column is held open, because there is no room to hold one.',
  ].join(' ')),
  play: async ({ canvas }) => {
    await expect(
      composerIndent(canvas),
      'the row is still holding columns open at a width that cannot fit them'
    ).toBe(0)
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

export const GhostComposerMaterializes = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoListForm>} */ ({
  ...storyDocs([
    '**Why:** The composer owns its own text now, so Add / Enter must mint the Todo itself rather than reporting keystrokes upward.',
    '**See:** Typing accumulates in Add a todo without writing anything; Add todo then calls `addTodo` once with the whole text and clears the field.',
  ].join(' ')),
  play: async ({ canvas, loaded }) => {
    const composer = canvas.getByLabelText('Add a todo')
    await userEvent.type(composer, 'New')
    // Proof: keystrokes are in-flight text, not facts. Nothing is written until
    // the field settles.
    await expect(loaded.commands.addTodo).not.toHaveBeenCalled()

    await userEvent.click(canvas.getByRole('button', { name: 'Add todo' }))
    await expect(loaded.commands.addTodo).toHaveBeenCalledWith('list', 'New')
    await expect(loaded.commands.addTodo).toHaveBeenCalledTimes(1)
    await expect(composer).toHaveValue('')
  },
})

export const GhostComposerIgnoresBlank = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoListForm>} */ ({
  ...storyDocs([
    '**Why:** `text` is a Todo’s defining attribute, so a blank composer has nothing to assert.',
    '**See:** Pressing Add todo on an untouched composer writes nothing.',
  ].join(' ')),
  play: async ({ canvas, loaded }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Add todo' }))
    await expect(loaded.commands.addTodo).not.toHaveBeenCalled()
    await expect(loaded.commands.deleteTodo).not.toHaveBeenCalled()
  },
})
