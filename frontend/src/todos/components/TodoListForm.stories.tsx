import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent } from 'storybook/test'
import { storyDocs } from '../../testing/storyDocs.ts'
import { TodoListForm } from './TodoListForm.tsx'

const FORM_SCENARIO_DAY = '2026-07-31'

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
  materializeList: fn(),
  renameList: fn(),
  deleteList: fn(),
  addTodo: fn(() => 'new-todo'),
  retitleTodo: fn(),
  setTodoCompleted: fn(),
  setTodoDueDate: fn(),
  deleteTodo: fn(),
})

const meta = ({
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
  render: (args, { loaded }) => <TodoListForm {...args} commands={loaded['commands']} />,
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
}) as Meta<typeof TodoListForm>

export default meta

export const Populated = ({
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
    await expect(loaded['commands'].retitleTodo).toHaveBeenCalledWith(
      baseList.todos[0],
      'Updated'
    )

    await userEvent.click(canvas.getByLabelText('Delete todo: Original'))
    await expect(loaded['commands'].deleteTodo).toHaveBeenCalledWith(baseList.todos[0])
  },
}) as StoryObj<typeof TodoListForm>

/*
 * The two stories below pin a viewport and carry no `play`, deliberately.
 *
 * They used to assert their own layout: that the Todo's controls shared a top
 * on desktop, that the text field sat below the completion box on mobile. Both
 * sides of every one of those comparisons came out of the same layout pass, so
 * they only ever restated what Chromium had just computed - given `flex-wrap`
 * and a narrow box, the browser has no choice but to wrap. They proved the
 * browser works, not that this row does.
 *
 * They were also brittle in the expensive direction: a redesign to a 2x2 mobile
 * row would fail them while being perfectly good, and plenty of broken layouts
 * would still satisfy them.
 *
 * A geometry assertion is worth writing when it compares two independently
 * sourced values - see `TodoItem` > Controls share one height, which measures
 * our mirrored `control.height` against whatever MUI's own input computes, and
 * so catches a real drift. Nothing here has a second source, so there is
 * nothing to catch. Pinning these layouts is a job for visual regression.
 *
 * They still earn their place as documented responsive states, and each one
 * still runs the axe pass at its own width.
 */

export const Desktop = ({
  globals: { viewport: { value: 'desktop' } },
  ...storyDocs([
    '**Why:** The composer fills only the `text` slot of a Todo row, so its field lands on the same column as the text of every Todo beneath it. Before `TodoRow` owned placement, the two started 272px apart.',
    '**See:** One line per Todo, and Add a todo sharing its left edge with What to do?.',
  ].join(' ')),
}) as StoryObj<typeof TodoListForm>

export const SmallMobile = ({
  globals: { viewport: { value: 'mobile1' } },
  ...storyDocs([
    '**Why:** Four columns need 28rem and cannot fit a phone. Holding them open would push the row past the screen and put the Todo text out of reach, so below `sm` the row drops back to the wrapping layout it has always used.',
    '**See:** At 320px each control takes its own line and nothing runs off the side.',
  ].join(' ')),
}) as StoryObj<typeof TodoListForm>

export const UnmaterializedDraft = ({
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
}) as StoryObj<typeof TodoListForm>

export const TitleEnterFocusesComposer = ({
  ...storyDocs([
    '**Why:** Accepting the title (Enter) should move focus into the ghost composer for the next Todo.',
    '**See:** Enter in Todo List name focuses Add a todo.',
  ].join(' ')),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByLabelText('Todo List name'))
    await userEvent.keyboard('{Enter}')
    await expect(canvas.getByLabelText('Add a todo')).toHaveFocus()
  },
}) as StoryObj<typeof TodoListForm>

export const GhostComposerMaterializes = ({
  ...storyDocs([
    '**Why:** The composer owns its own text now, so Add / Enter must mint the Todo itself rather than reporting keystrokes upward.',
    '**See:** Typing accumulates in Add a todo without writing anything; Add todo then calls `addTodo` once with the whole text and clears the field.',
  ].join(' ')),
  play: async ({ canvas, loaded }) => {
    const composer = canvas.getByLabelText('Add a todo')
    await userEvent.type(composer, 'New')
    // Proof: keystrokes are in-flight text, not facts. Nothing is written until
    // the field settles.
    await expect(loaded['commands'].addTodo).not.toHaveBeenCalled()

    await userEvent.click(canvas.getByRole('button', { name: 'Add todo' }))
    await expect(loaded['commands'].addTodo).toHaveBeenCalledWith('list', 'New')
    await expect(loaded['commands'].addTodo).toHaveBeenCalledTimes(1)
    await expect(composer).toHaveValue('')
  },
}) as StoryObj<typeof TodoListForm>

export const GhostComposerIgnoresBlank = ({
  ...storyDocs([
    '**Why:** `text` is a Todo’s defining attribute, so a blank composer has nothing to assert.',
    '**See:** Pressing Add todo on an untouched composer writes nothing.',
  ].join(' ')),
  play: async ({ canvas, loaded }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Add todo' }))
    await expect(loaded['commands'].addTodo).not.toHaveBeenCalled()
    await expect(loaded['commands'].deleteTodo).not.toHaveBeenCalled()
  },
}) as StoryObj<typeof TodoListForm>
