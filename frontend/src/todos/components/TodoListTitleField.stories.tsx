import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent } from 'storybook/test'
import { storyDocs } from '../../testing/storyDocs.ts'
import { TodoListTitleField } from './TodoListTitleField.tsx'

const meta = ({
  title: 'Todos/TodoListTitleField',
  component: TodoListTitleField,
  args: {
    onMaterialize: fn(),
    onTitleChange: fn(),
    onCancelDraft: fn(),
    onAccept: fn(),
  },
  parameters: {
    docs: {
      description: {
        component: [
          '**TodoListTitleField** is the Todo List name control. Edits settle on blur/Enter (trimmed). A **draft** materializes once via `onMaterialize`; afterward renames call `onTitleChange`. Blank titles never assert.',
          '**Enter** (non-blank) settles then `onAccept` (form moves focus to the composer). **Escape** cancels an unmaterialized draft (`onCancelDraft`) or resets a saved title to the current prop. Non-draft blank shows required error until blur restores the saved title.',
        ].join('\n\n'),
      },
    },
  },
}) as Meta<typeof TodoListTitleField>

export default meta

export const BlankDraft = ({
  args: {
    title: '',
    draft: true,
  },
  ...storyDocs([
    '**Why:** A draft must not materialize on every keystroke — only when the trimmed title settles.',
    '**See:** Typing `  Release` does not call `onMaterialize` yet; after tab, `onMaterialize("Release")` once. Draft blank is not an error field.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    const field = canvas.getByLabelText('Todo List name')
    await expect(field).not.toBeInvalid()
    await userEvent.type(field, '  Release')
    await expect(args.onMaterialize).not.toHaveBeenCalled()
    await expect(args.onTitleChange).not.toHaveBeenCalled()
    await userEvent.tab()
    await expect(args.onMaterialize).toHaveBeenCalledTimes(1)
    await expect(args.onMaterialize).toHaveBeenCalledWith('Release')
    await expect(args.onTitleChange).not.toHaveBeenCalled()
  },
}) as StoryObj<typeof TodoListTitleField>

export const CancelDraft = ({
  args: {
    title: '',
    draft: true,
  },
  ...storyDocs([
    '**Why:** Escape before materialize must abandon the draft, not save a title.',
    '**See:** Type Temporary then Escape → `onCancelDraft` once; no `onMaterialize`.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    const field = canvas.getByLabelText('Todo List name')
    await userEvent.type(field, 'Temporary{Escape}')
    await expect(args.onCancelDraft).toHaveBeenCalledTimes(1)
    await expect(args.onMaterialize).not.toHaveBeenCalled()
    await expect(args.onTitleChange).not.toHaveBeenCalled()
  },
}) as StoryObj<typeof TodoListTitleField>

export const SavedTitle = ({
  args: {
    title: 'Release',
  },
  ...storyDocs([
    '**Why:** Clearing a saved title must warn and must not assert a blank rename; blur restores the prop.',
    '**See:** Clear → invalid + “Todo List name is required”; blur restores Release; no `onTitleChange("")`, no `onAccept`.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    const field = canvas.getByLabelText('Todo List name')
    await userEvent.clear(field)
    await expect(field).toBeInvalid()
    await expect(canvas.getByText('Todo List name is required')).toBeInTheDocument()
    await expect(args.onTitleChange).not.toHaveBeenCalledWith('')
    await userEvent.tab()
    await expect(field).toHaveValue('Release')
    await expect(field).not.toBeInvalid()
    await expect(args.onAccept).not.toHaveBeenCalled()
  },
}) as StoryObj<typeof TodoListTitleField>

export const RenameOnEnterAndEscape = ({
  args: {
    title: 'Release',
  },
  ...storyDocs([
    '**Why:** Enter renames and accepts; Escape discards an in-progress edit back to the saved title.',
    '**See:** Enter with Renamed → `onTitleChange("Renamed")` and `onAccept` once; then Temporary + Escape restores Release without another accept.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    const field = canvas.getByLabelText('Todo List name')
    await userEvent.clear(field)
    await userEvent.type(field, '  Renamed  {Enter}')
    await expect(args.onTitleChange).toHaveBeenLastCalledWith('Renamed')
    await expect(args.onAccept).toHaveBeenCalledTimes(1)
    await expect(args.onCancelDraft).not.toHaveBeenCalled()

    await userEvent.clear(field)
    await userEvent.type(field, 'Temporary{Escape}')
    await expect(field).toHaveValue('Release')
    await expect(args.onAccept).toHaveBeenCalledTimes(1)
  },
}) as StoryObj<typeof TodoListTitleField>
