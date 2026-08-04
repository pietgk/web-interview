import { expect, fn, screen, userEvent } from 'storybook/test'
import { StatusBar } from './StatusBar'

/** @param {Partial<import('@web-interview/todos/types').TodoClientStatus>} [overrides] */
const runtime = (overrides = {}) => ({
  client: /** @type {import('../useTodoLists').TodoRuntime['client']} */ (
    /** @type {unknown} */ ({ reconnect: fn() })
  ),
  readModel: {},
  status: {
    connection: /** @type {const} */ ('live'),
    pendingCount: 0,
    saving: false,
    canEdit: true,
    error: null,
    ...overrides,
  },
})

const meta = /** @type {import('@storybook/react-vite').Meta<typeof StatusBar>} */ ({
  title: 'Todos/StatusBar',
  component: StatusBar,
})

export default meta

export const AllChangesSaved = /** @type {import('@storybook/react-vite').StoryObj<typeof StatusBar>} */ ({
  args: { runtime: runtime() },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Things to do' })).toBeInTheDocument()
    await expect(canvas.getByRole('status', { name: 'Application status' })).toHaveTextContent(
      'All changes saved'
    )
  },
})

export const Saving = /** @type {import('@storybook/react-vite').StoryObj<typeof StatusBar>} */ ({
  args: { runtime: runtime({ pendingCount: 1, saving: true }) },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toHaveTextContent('Saving…')
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument()
  },
})

export const Reconnecting = /** @type {import('@storybook/react-vite').StoryObj<typeof StatusBar>} */ ({
  args: { runtime: runtime({ connection: 'reconnecting', pendingCount: 2 }) },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert', { name: 'Application status' })).toHaveTextContent(
      /Connection lost.*Waiting for connection/
    )
  },
})

export const ConnectionFailed = /** @type {import('@storybook/react-vite').StoryObj<typeof StatusBar>} */ ({
  args: { runtime: runtime({ connection: 'failed', error: 'Gateway unavailable' }) },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent('Connection lost')
    await userEvent.click(canvas.getByRole('button', { name: 'Details' }))
    await expect(await screen.findByRole('dialog', { name: 'Status details' })).toHaveTextContent(
      'Gateway unavailable'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    await expect(screen.queryByRole('dialog', { name: 'Status details' })).not.toBeInTheDocument()

    await userEvent.click(canvas.getByRole('button', { name: 'Reconnect' }))
    await expect(args.runtime.client.reconnect).toHaveBeenCalledTimes(1)
  },
})
