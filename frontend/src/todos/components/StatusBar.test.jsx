import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StatusBar } from './StatusBar'

/** @typedef {{actor: import('@web-interview/todos/actor').TodoListActor, clientId: string, snapshot: import('@web-interview/todos/types').TodoListSnapshot}} TodoRuntime */

/** @param {Partial<import('@web-interview/todos/types').TodoListSnapshot>} [overrides] @returns {TodoRuntime} */
const runtime = (overrides = {}) => /** @type {TodoRuntime} */ (/** @type {unknown} */ ({
  clientId: 'status-test',
  actor: { send: vi.fn() },
  snapshot: {
    status: 'ready',
    readModel: {},
    pendingTransactions: [],
    rejectedTransactions: [],
    persistenceStatus: 'idle',
    syncStatus: 'idle',
    error: null,
    ...overrides,
  },
}))

describe('StatusBar', () => {
  it('renders the permanent h1 and a polite success live region', () => {
    render(<StatusBar runtime={runtime()} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Things to do' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Application status' })).toHaveTextContent(
      'All changes saved'
    )
  })

  it('targets synchronization recovery and exposes meaningful Details', async () => {
    const user = userEvent.setup()
    const value = runtime({ syncStatus: 'failed', error: 'Gateway unavailable' })
    render(<StatusBar runtime={value} />)

    expect(screen.getByRole('alert', { name: 'Application status' })).toHaveTextContent(
      /Saved on this device.*Server sync failed/
    )
    await user.click(screen.getByRole('button', { name: 'Details' }))
    expect(await screen.findByRole('dialog', { name: 'Status details' })).toHaveTextContent(
      'Gateway unavailable'
    )
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', {
      name: 'Status details',
    })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', {
      name: 'Retry server synchronization',
    }))
    expect(value.actor.send).toHaveBeenCalledWith({ type: 'RETRY_SYNC' })
  })

  it('reviews and dismisses a rejected transaction without combining controls', async () => {
    const user = userEvent.setup()
    const value = runtime({
      readModel: { list: { id: 'list', title: 'Release', todos: [] } },
      rejectedTransactions: [{
        id: 'tx-rejected',
        listId: 'list',
        error: 'Title was rejected',
        code: 'VALIDATION_ERROR',
      }],
    })
    render(<StatusBar runtime={value} />)

    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(await screen.findByRole('dialog', { name: 'Status details' })).toHaveTextContent('Release')
    expect(screen.getByRole('dialog', { name: 'Status details' })).toHaveTextContent(
      'optimistic change was rolled back'
    )
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', {
      name: 'Status details',
    })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', {
      name: 'Dismiss rejected change notification',
    }))
    expect(value.actor.send).toHaveBeenCalledWith({
      type: 'DISMISS_REJECTION',
      transactionId: 'tx-rejected',
    })
  })
})
