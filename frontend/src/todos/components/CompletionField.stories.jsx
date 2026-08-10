import { expect, fn, userEvent } from 'storybook/test'
import { storyDocs } from '../../testing/storyDocs'
import { CompletionField } from './CompletionField'

const meta = /** @type {import('@storybook/react-vite').Meta<typeof CompletionField>} */ ({
  title: 'Todos/CompletionField',
  component: CompletionField,
  args: {
    todoLabel: 'Buy milk',
    onChange: fn(),
  },
  parameters: {
    docs: {
      description: {
        component: [
          '**CompletionField** is the Done checkbox for one Todo. The visible label is always **Done**; `todoLabel` is not shown — it only builds the accessible name `Mark completed: {todoLabel}` so rows can be told apart by screen readers and tests.',
          'In the app, `TodoItem` passes the Todo’s text (or `untitled`). Stories use `Buy milk` as a stand-in. Duplicate Todo text means duplicate accessible names: the UI still works, but announcements and `getByLabelText` are no longer unique.',
          '**Docs vs story Canvas:** Docs previews are **before-`play`**. Open the story for the **after-`play`** result (Why/See). No Docs autoplay — keeps this small field free of cross-story focus races.',
        ].join('\n\n'),
      },
    },
  },
})

export default meta

export const Incomplete = /** @type {import('@storybook/react-vite').StoryObj<typeof CompletionField>} */ ({
  args: { completed: false },
  ...storyDocs([
    '**Why:** An incomplete Todo must expose an unchecked Done control that can be toggled on.',
    '**See:** Checkbox starts unchecked; after click (story Canvas), `onChange(true)` fires. Look up the control as `Mark completed: Buy milk`, not “Done”.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    const checkbox = canvas.getByLabelText(`Mark completed: ${args.todoLabel}`)
    await expect(checkbox).not.toBeChecked()
    await userEvent.click(canvas.getByText('Done'))
    await expect(args.onChange).toHaveBeenCalledWith(true)
  },
})

export const Completed = /** @type {import('@storybook/react-vite').StoryObj<typeof CompletionField>} */ ({
  args: { completed: true },
  ...storyDocs([
    '**Why:** A completed Todo must show Done already checked.',
    '**See:** `Mark completed: Buy milk` is checked. Setup and after-`play` look the same — `play` only asserts.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    await expect(canvas.getByLabelText(`Mark completed: ${args.todoLabel}`)).toBeChecked()
  },
})
