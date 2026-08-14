import { useState } from 'react'
import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, expect, fireEvent } from 'storybook/test'
import { storyDocs } from '../../testing/storyDocs.ts'
import { DueIn } from './DueIn.tsx'

/** Frozen so due labels stay stable in Docs and play (not “today” from the wall clock). */
const today = '2026-07-31'
const editedDueDay = '2026-08-15'
const tomorrow = '2026-08-01'
const yesterday = '2026-07-30'

/**
 * Keeps dueDate in sync so change → clear can both fire against a controlled field.
 */
const StatefulDueIn = ({ dueDate: initialDueDate, onChange, ...rest }: ComponentProps<typeof DueIn>) => {
  const [dueDate, setDueDate] = useState(initialDueDate)
  return (
    <DueIn
      {...rest}
      dueDate={dueDate}
      onChange={(next) => {
        onChange(next)
        setDueDate(next)
      }}
    />
  )
}

const meta = ({
  title: 'Todos/DueIn',
  component: DueIn,
  args: {
    todoLabel: 'Buy milk',
    onChange: fn(),
    today,
  },
  parameters: {
    docs: {
      description: {
        component: [
          '**DueIn** is the date field for one Todo. The visible label tracks due status (`Due date`, `Due today`, `Due in 1 day`, `1 day overdue`, …). Overdue also sets the field error state.',
          '`todoLabel` is not shown - it only builds the accessible name `{status label}: {todoLabel}` (same idea as CompletionField). Stories use `Buy milk` and a fixed `today` (31 Jul 2026) so labels do not drift. When `completed` is true, status is cleared and the label falls back to **Due date**.',
          'These plays assert the field value, status label (via accessible name), and error state for each story; `NoDueDate` also checks `onChange` (via a stateful wrapper so the controlled value updates).',
        ].join('\n\n'),
      },
    },
  },
}) as Meta<typeof DueIn>

export default meta

export const NoDueDate = ({
  args: {
    dueDate: null,
    completed: false,
  },
  render: (args) => <StatefulDueIn {...args} />,
  ...storyDocs([
    '**Why:** With no date, the field is a neutral date picker — not overdue or remaining — and edits must reach the parent.',
    '**See:** Empty value, accessible name `Due date: Buy milk`, not invalid; changing the date calls `onChange` with that date, clearing calls `onChange(null)`; the document declares a `color-scheme`, so the browser paints the picker icon to match the theme.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    const field = canvas.getByLabelText(`Due date: ${args.todoLabel}`)
    await expect(field).toHaveValue('')
    await expect(field).not.toBeInvalid()

    // This is the only field whose affordance the browser paints rather than
    // MUI, so it is the only one that goes wrong when the document does not say
    // which scheme it is in: at `normal` the picker icon stays a dark glyph on a
    // dark card. Asserting the mode itself would only hold under one theme.
    await expect(getComputedStyle(document.documentElement).colorScheme).not.toBe('normal')

    fireEvent.change(field, { target: { value: editedDueDay } })
    await expect(args.onChange).toHaveBeenNthCalledWith(1, editedDueDay)
    await expect(field).toHaveValue(editedDueDay)

    fireEvent.change(field, { target: { value: '' } })
    await expect(args.onChange).toHaveBeenNthCalledWith(2, null)
    await expect(field).toHaveValue('')
  },
}) as StoryObj<typeof DueIn>

export const DueToday = ({
  args: {
    dueDate: today,
    completed: false,
  },
  ...storyDocs([
    '**Why:** A due date equal to `today` is called out as today, without error styling.',
    '**See:** Value `2026-07-31`, accessible name `Due today: Buy milk`, not invalid.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    const field = canvas.getByLabelText(`Due today: ${args.todoLabel}`)
    await expect(field).toHaveValue(today)
    await expect(field).not.toBeInvalid()
  },
}) as StoryObj<typeof DueIn>

export const DueInOneDay = ({
  args: {
    dueDate: tomorrow,
    completed: false,
  },
  ...storyDocs([
    '**Why:** Upcoming dates use a relative “due in …” label, without error styling.',
    '**See:** Value `2026-08-01`, accessible name `Due in 1 day: Buy milk`, not invalid.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    const field = canvas.getByLabelText(`Due in 1 day: ${args.todoLabel}`)
    await expect(field).toHaveValue(tomorrow)
    await expect(field).not.toBeInvalid()
  },
}) as StoryObj<typeof DueIn>

export const Overdue = ({
  args: {
    dueDate: yesterday,
    completed: false,
  },
  ...storyDocs([
    '**Why:** Past incomplete dates must read as overdue and show as an error field.',
    '**See:** Value `2026-07-30`, accessible name `1 day overdue: Buy milk`, field is invalid.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    const field = canvas.getByLabelText(`1 day overdue: ${args.todoLabel}`)
    await expect(field).toHaveValue(yesterday)
    await expect(field).toBeInvalid()
  },
}) as StoryObj<typeof DueIn>

export const CompletedHidesOverdue = ({
  args: {
    dueDate: yesterday,
    completed: true,
  },
  ...storyDocs([
    '**Why:** Completing a Todo clears due urgency — a past date must not stay overdue or invalid.',
    '**See:** Value still `2026-07-30`, accessible name `Due date: Buy milk`, not invalid.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    const field = canvas.getByLabelText(`Due date: ${args.todoLabel}`)
    await expect(field).toHaveValue(yesterday)
    await expect(field).not.toBeInvalid()
  },
}) as StoryObj<typeof DueIn>
