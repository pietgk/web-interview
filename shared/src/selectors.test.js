import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { hasLocallyUndurableChanges } from './selectors.js'

describe('todo-list selectors', () => {
  it('does not treat server-pending transactions as locally undurable', () => {
    const snapshot = {
      pendingTransactions: [{ id: 'saved-offline' }],
      persistenceStatus: /** @type {const} */ ('idle'),
      syncStatus: 'offline',
    }
    assert.equal(
      hasLocallyUndurableChanges(snapshot),
      false
    )
  })

  it('detects transactions that are still being written locally', () => {
    assert.equal(
      hasLocallyUndurableChanges({ persistenceStatus: 'writing' }),
      true
    )
  })

  it('detects a failed local write', () => {
    assert.equal(
      hasLocallyUndurableChanges({ persistenceStatus: 'failed' }),
      true
    )
  })
})
