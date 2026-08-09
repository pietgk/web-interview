import { expect, fn, fireEvent, userEvent } from 'storybook/test'
import { TODO_TEXT_MAX_LENGTH } from '@web-interview/todos/protocol'
import { TodoItem } from './TodoItem'

/** @param {string} story */
const storyDocs = (story) => ({
  parameters: {
    docs: {
      description: { story },
    },
  },
})

/** Frozen so DueIn labels stay stable (same clock as DueIn stories). */
const today = '2026-07-31'
const tomorrow = '2026-08-01'
const editedDueDay = '2026-08-05'
const yesterday = '2026-07-30'

/** @param {Partial<import('@web-interview/todos/types').Todo>} [overrides] */
const createTodo = (overrides = {}) => ({
  id: '1',
  text: '',
  completed: false,
  dueDate: null,
  ...overrides,
})

const meta = /** @type {import('@storybook/react-vite').Meta<typeof TodoItem>} */ ({
  title: 'Todos/TodoItem',
  component: TodoItem,
  args: {
    onChange: fn(),
    onRemove: fn(),
    today,
  },
  parameters: {
    docs: {
      description: {
        component: [
          '**TodoItem** is one Todo row: Done (`CompletionField`), due date (`DueIn`), **What to do?** text, and delete. The row group is named `Todo: {text}` (or `untitled` when blank); the same label is passed into the child fields’ accessible names.',
          'Text edits settle on blur/Enter via `useSettledText` - keystrokes do not call `onChange({ text })` until then. Completion and due date patch immediately. Due status uses the story `today` (31 Jul 2026). Deep DueIn/CompletionField cases live in those components’ stories; here we prove wiring and the completed-clears-overdue handoff.',
        ].join('\n\n'),
      },
    },
  },
})

export default meta

export const ActiveWithDueDate = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoItem>} */ ({
  args: {
    todo: createTodo({ id: '1', text: 'Buy milk', dueDate: tomorrow }),
  },
  ...storyDocs([
    '**Why:** An active Todo must wire every control: settled text, completion, due date, and delete.',
    '**See:** Group Todo: Buy milk with Due in 1 day; typing `!` does not patch text until tab/blur; then complete, change due, and delete each fire the matching callback.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    const label = args.todo.text
    await expect(canvas.getByRole('group', { name: `Todo: ${label}` })).toBeInTheDocument()
    await expect(canvas.getByLabelText('What to do?')).toHaveValue(label)
    await expect(canvas.getByLabelText('What to do?')).toHaveAttribute(
      'maxlength',
      String(TODO_TEXT_MAX_LENGTH)
    )
    await expect(canvas.getByLabelText(`Mark completed: ${label}`)).not.toBeChecked()
    const due = canvas.getByLabelText(`Due in 1 day: ${label}`)
    await expect(due).toHaveValue(tomorrow)
    await expect(due).not.toBeInvalid()

    await userEvent.type(canvas.getByLabelText('What to do?'), '!')
    await expect(args.onChange).not.toHaveBeenCalledWith({ text: `${label}!` })
    await userEvent.tab()
    await expect(args.onChange).toHaveBeenCalledWith({ text: `${label}!` })

    await userEvent.click(canvas.getByLabelText(`Mark completed: ${label}`))
    await expect(args.onChange).toHaveBeenCalledWith({ completed: true })

    fireEvent.change(due, { target: { value: editedDueDay } })
    await expect(args.onChange).toHaveBeenCalledWith({ dueDate: editedDueDay })

    await userEvent.click(canvas.getByLabelText(`Delete todo: ${label}`))
    await expect(args.onRemove).toHaveBeenCalledTimes(1)
  },
})

export const CompletedNotOverdue = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoItem>} */ ({
  args: {
    todo: createTodo({
      id: '1',
      text: 'Done',
      completed: true,
      dueDate: yesterday,
    }),
  },
  ...storyDocs([
    '**Why:** Completing a Todo must clear due urgency on the row — a past date must not stay overdue.',
    '**See:** Done is checked; due field stays `2026-07-30` but accessible name is `Due date: Done` and the field is not invalid.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    const label = args.todo.text
    await expect(canvas.getByRole('group', { name: `Todo: ${label}` })).toBeInTheDocument()
    await expect(canvas.getByLabelText(`Mark completed: ${label}`)).toBeChecked()
    const due = canvas.getByLabelText(`Due date: ${label}`)
    await expect(due).toHaveValue(yesterday)
    await expect(due).not.toBeInvalid()
  },
})

export const ControlsShareOneHeight = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoItem>} */ ({
  args: {
    todo: createTodo({ id: '1', text: 'Buy milk', dueDate: tomorrow }),
  },
  ...storyDocs([
    '**Why:** Done is not an input, so it cannot inherit the height MUI gives the two fields beside it - `theme.todos.control.height` mirrors that height by hand.',
    'A mirrored value drifts silently: change MUI’s density or upgrade the library and the completion box keeps its old height while the fields move. This story is the gate that makes that loud.',
    '**See:** Done, the due date field and What to do? all render at exactly one height.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    const row = canvas.getByRole('group', { name: `Todo: ${args.todo.text}` })
    const [completion, dueDate, text] = Array.from(row.children)
    const heights = [completion, dueDate, text].map((cell) =>
      Math.round(cell.getBoundingClientRect().height)
    )

    await expect(
      new Set(heights).size,
      `Done, due date and text rendered at ${heights.join('/')}px. ` +
        'theme.todos.control.height no longer matches MUI’s outlined input.'
    ).toBe(1)
  },
})

export const Untitled = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoItem>} */ ({
  args: {
    todo: createTodo({ id: '1', text: '   ', dueDate: null }),
  },
  ...storyDocs([
    '**Why:** Blank Todo text still needs stable accessible names — the row falls back to `untitled`.',
    '**See:** Group Todo: untitled; Mark completed / Delete todo use `untitled`; What to do? shows the blank value.',
  ].join(' ')),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('group', { name: 'Todo: untitled' })).toBeInTheDocument()
    await expect(canvas.getByLabelText('Mark completed: untitled')).toBeInTheDocument()
    await expect(canvas.getByLabelText('Delete todo: untitled')).toBeInTheDocument()
    await expect(canvas.getByLabelText('What to do?')).toHaveValue('   ')
  },
})
