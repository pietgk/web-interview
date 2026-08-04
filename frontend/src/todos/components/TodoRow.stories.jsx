import { TextField } from '@mui/material'
import { expect } from 'storybook/test'
import { TodoRow } from './TodoRow'

const meta = /** @type {import('@storybook/react-vite').Meta<typeof TodoRow>} */ ({
  title: 'Todos/TodoRow',
  component: TodoRow,
})

export default meta

export const GroupedFields = /** @type {import('@storybook/react-vite').StoryObj<typeof TodoRow>} */ ({
  args: {
    ariaLabel: 'Todo: Buy milk',
    children: (
      <>
        <TextField label='What to do?' defaultValue='Buy milk' />
        <TextField label='Due date' type='date' InputLabelProps={{ shrink: true }} />
      </>
    ),
  },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole('group', { name: args.ariaLabel })).toBeInTheDocument()
  },
})
