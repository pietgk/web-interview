import { useState } from 'react'
import { Button } from '@mui/material'
import { expect, fn, screen, userEvent, within } from 'storybook/test'
import StatusDetailsDialog from './StatusDetailsDialog'

/** @param {string} story */
const storyDocs = (story) => ({
  parameters: {
    docs: {
      description: { story },
    },
  },
})

/**
 * Stories start closed so Docs is not covered by a modal backdrop.
 * StatusBar opens this dialog the same way (local `detailsOpen`).
 *
 * @param {import('react').ComponentProps<typeof StatusDetailsDialog>} props
 */
const StatusDetailsStory = ({ details, onClose }) => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open status details</Button>
      <StatusDetailsDialog
        open={open}
        details={details}
        onClose={() => {
          onClose()
          setOpen(false)
        }}
      />
    </>
  )
}

const meta = /** @type {import('@storybook/react-vite').Meta<typeof StatusDetailsDialog>} */ ({
  title: 'Todos/StatusDetailsDialog',
  component: StatusDetailsDialog,
  args: {
    onClose: fn(),
  },
  render: (args) => <StatusDetailsStory {...args} />,
  parameters: {
    docs: {
      description: {
        component: [
          '**StatusDetailsDialog** shows the optional reason behind a StatusBar warning/error (or a fallback when none is provided). StatusBar opens it via **Details**.',
          'Stories use an **Open status details** trigger so Docs stays readable — mounting with `open: true` covers the page with a modal backdrop. Plays assert copy and `onClose`; closing the dialog in the DOM is the parent/wrapper.',
        ].join('\n\n'),
      },
    },
  },
})

export default meta

export const WithReason = /** @type {import('@storybook/react-vite').StoryObj<typeof StatusDetailsDialog>} */ ({
  args: {
    details: { reason: 'Gateway unavailable' },
  },
  ...storyDocs([
    '**Why:** When StatusBar has a reason string, Details must surface it verbatim.',
    '**See:** After opening, dialog Status details contains Gateway unavailable; Close calls `onClose`.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open status details' }))
    const dialog = screen.getByRole('dialog', { name: 'Status details' })
    await expect(dialog).toHaveTextContent('Gateway unavailable')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await expect(args.onClose).toHaveBeenCalledTimes(1)
  },
})

export const WithoutDetails = /** @type {import('@storybook/react-vite').StoryObj<typeof StatusDetailsDialog>} */ ({
  args: {
    details: null,
  },
  ...storyDocs([
    '**Why:** Failure/stall without a reason must still open Details with an honest fallback — not a blank dialog.',
    '**See:** After opening, body is No further detail is available.; Close dismisses (same end state as With Reason).',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open status details' }))
    const dialog = screen.getByRole('dialog', { name: 'Status details' })
    await expect(dialog).toHaveTextContent('No further detail is available.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await expect(args.onClose).toHaveBeenCalledTimes(1)
  },
})
