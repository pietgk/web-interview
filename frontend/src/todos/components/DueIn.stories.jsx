import { fn, expect } from 'storybook/test'
import { DueIn } from './DueIn'

const now = new Date(2026, 6, 31)

const meta = /** @type {import('@storybook/react-vite').Meta<typeof DueIn>} */ ({
  title: 'Todos/DueIn',
  component: DueIn,
  args: {
    todoLabel: 'Buy milk',
    onChange: fn(),
    now,
  },
})

export default meta

export const NoDueDate = /** @type {import('@storybook/react-vite').StoryObj<typeof DueIn>} */ ({
  args: {
    dueDate: null,
    completed: false,
  },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByLabelText(`Due date: ${args.todoLabel}`)).toBeInTheDocument()
  },
})

export const DueToday = /** @type {import('@storybook/react-vite').StoryObj<typeof DueIn>} */ ({
  args: {
    dueDate: '2026-07-31',
    completed: false,
  },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByLabelText(`Due today: ${args.todoLabel}`)).toBeInTheDocument()
  },
})

export const DueInOneDay = /** @type {import('@storybook/react-vite').StoryObj<typeof DueIn>} */ ({
  args: {
    dueDate: '2026-08-01',
    completed: false,
  },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByLabelText(`Due in 1 day: ${args.todoLabel}`)).toBeInTheDocument()
  },
})

export const Overdue = /** @type {import('@storybook/react-vite').StoryObj<typeof DueIn>} */ ({
  args: {
    dueDate: '2026-07-30',
    completed: false,
  },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByLabelText(`1 day overdue: ${args.todoLabel}`)).toBeInTheDocument()
  },
})

export const CompletedHidesOverdue = /** @type {import('@storybook/react-vite').StoryObj<typeof DueIn>} */ ({
  args: {
    dueDate: '2026-07-30',
    completed: true,
  },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByLabelText(`Due date: ${args.todoLabel}`)).toBeInTheDocument()
    await expect(canvas.queryByText(/overdue/i)).not.toBeInTheDocument()
  },
})
