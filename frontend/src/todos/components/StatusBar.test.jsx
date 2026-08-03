import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StatusBar } from './StatusBar'

/** @param {Partial<import('@web-interview/todos/types').TodoClientStatus>} [overrides] */
const runtime = (overrides = {}) => ({
  client: /** @type {import('../useTodoLists').TodoRuntime['client']} */ (
    /** @type {unknown} */ ({ reconnect: vi.fn() })
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

describe('StatusBar', () => {
  it('renders the permanent h1 and a polite success live region', () => {
    render(<StatusBar runtime={runtime()} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Things to do' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Application status' })).toHaveTextContent(
      'All changes saved'
    )
  })

  it('announces a saving outbox without an action to take', () => {
    render(<StatusBar runtime={runtime({ pendingCount: 1, saving: true })} />)

    expect(screen.getByRole('status')).toHaveTextContent('Saving…')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('warns while the stream is retrying and names the unsent work', () => {
    render(<StatusBar runtime={runtime({ connection: 'reconnecting', pendingCount: 2 })} />)

    expect(screen.getByRole('alert', { name: 'Application status' })).toHaveTextContent(
      /Connection lost.*Waiting for connection/
    )
  })

  it('offers reconnection and meaningful Details when the stream has closed', async () => {
    const user = userEvent.setup()
    const value = runtime({ connection: 'failed', error: 'Gateway unavailable' })
    render(<StatusBar runtime={value} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Connection lost')
    await user.click(screen.getByRole('button', { name: 'Details' }))
    expect(await screen.findByRole('dialog', { name: 'Status details' })).toHaveTextContent(
      'Gateway unavailable'
    )
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', {
      name: 'Status details',
    })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reconnect' }))
    expect(value.client.reconnect).toHaveBeenCalledTimes(1)
  })
})
