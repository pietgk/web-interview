import { useState } from 'react'
import { fn, expect, fireEvent } from 'storybook/test'
import { DueIn } from './DueIn'

/** @param {string} story */
const storyDocs = (story) => ({
  parameters: {
    docs: {
      description: { story },
    },
  },
})

/** Frozen so due labels stay stable in Docs and play (not “today” from the wall clock). */
const today = '2026-07-31'

/**
 * Keeps dueDate in sync so change → clear can both fire against a controlled field.
 *
 * @param {import('react').ComponentProps<typeof DueIn>} props
 */
const StatefulDueIn = ({ dueDate: initialDueDate, onChange, ...rest }) => {
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

const meta = /** @type {import('@storybook/react-vite').Meta<typeof DueIn>} */ ({
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
})

export default meta

export const NoDueDate = /** @type {import('@storybook/react-vite').StoryObj<typeof DueIn>} */ ({
  args: {
    dueDate: null,
    completed: false,
  },
  render: (args) => <StatefulDueIn {...args} />,
  ...storyDocs([
    '**Why:** With no date, the field is a neutral date picker — not overdue or remaining — and edits must reach the parent.',
    '**See:** Empty value, accessible name `Due date: Buy milk`, not invalid; changing the date calls `onChange` with that date, clearing calls `onChange(null)`.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    const field = canvas.getByLabelText(`Due date: ${args.todoLabel}`)
    await expect(field).toHaveValue('')
    await expect(field).not.toBeInvalid()

    fireEvent.change(field, { target: { value: '2026-08-15' } })
    await expect(args.onChange).toHaveBeenNthCalledWith(1, '2026-08-15')
    await expect(field).toHaveValue('2026-08-15')

    fireEvent.change(field, { target: { value: '' } })
    await expect(args.onChange).toHaveBeenNthCalledWith(2, null)
    await expect(field).toHaveValue('')
  },
})

export const DueToday = /** @type {import('@storybook/react-vite').StoryObj<typeof DueIn>} */ ({
  args: {
    dueDate: '2026-07-31',
    completed: false,
  },
  ...storyDocs([
    '**Why:** A due date equal to `today` is called out as today, without error styling.',
    '**See:** Value `2026-07-31`, accessible name `Due today: Buy milk`, not invalid.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    const field = canvas.getByLabelText(`Due today: ${args.todoLabel}`)
    await expect(field).toHaveValue('2026-07-31')
    await expect(field).not.toBeInvalid()
  },
})

export const DueInOneDay = /** @type {import('@storybook/react-vite').StoryObj<typeof DueIn>} */ ({
  args: {
    dueDate: '2026-08-01',
    completed: false,
  },
  ...storyDocs([
    '**Why:** Upcoming dates use a relative “due in …” label, without error styling.',
    '**See:** Value `2026-08-01`, accessible name `Due in 1 day: Buy milk`, not invalid.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    const field = canvas.getByLabelText(`Due in 1 day: ${args.todoLabel}`)
    await expect(field).toHaveValue('2026-08-01')
    await expect(field).not.toBeInvalid()
  },
})

export const Overdue = /** @type {import('@storybook/react-vite').StoryObj<typeof DueIn>} */ ({
  args: {
    dueDate: '2026-07-30',
    completed: false,
  },
  ...storyDocs([
    '**Why:** Past incomplete dates must read as overdue and show as an error field.',
    '**See:** Value `2026-07-30`, accessible name `1 day overdue: Buy milk`, field is invalid.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    const field = canvas.getByLabelText(`1 day overdue: ${args.todoLabel}`)
    await expect(field).toHaveValue('2026-07-30')
    await expect(field).toBeInvalid()
  },
})

export const CompletedHidesOverdue = /** @type {import('@storybook/react-vite').StoryObj<typeof DueIn>} */ ({
  args: {
    dueDate: '2026-07-30',
    completed: true,
  },
  ...storyDocs([
    '**Why:** Completing a Todo clears due urgency — a past date must not stay overdue or invalid.',
    '**See:** Value still `2026-07-30`, accessible name `Due date: Buy milk`, not invalid.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    const field = canvas.getByLabelText(`Due date: ${args.todoLabel}`)
    await expect(field).toHaveValue('2026-07-30')
    await expect(field).not.toBeInvalid()
  },
})
