import { expect, fn, screen, userEvent } from 'storybook/test'
import StatusDetailsDialog from './StatusDetailsDialog'

const meta = /** @type {import('@storybook/react-vite').Meta<typeof StatusDetailsDialog>} */ ({
  title: 'Todos/StatusDetailsDialog',
  component: StatusDetailsDialog,
  args: {
    open: true,
    onClose: fn(),
  },
})

export default meta

export const WithReason = /** @type {import('@storybook/react-vite').StoryObj<typeof StatusDetailsDialog>} */ ({
  args: {
    details: { reason: 'Gateway unavailable' },
  },
  play: async ({ args }) => {
    await expect(screen.getByRole('dialog', { name: 'Status details' })).toHaveTextContent(
      'Gateway unavailable'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await expect(args.onClose).toHaveBeenCalled()
  },
})

export const WithoutDetails = /** @type {import('@storybook/react-vite').StoryObj<typeof StatusDetailsDialog>} */ ({
  args: {
    details: null,
  },
  play: async () => {
    await expect(screen.getByRole('dialog', { name: 'Status details' })).toHaveTextContent(
      'No further detail is available.'
    )
  },
})
