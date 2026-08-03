import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  hasLocallyUndurableChanges,
  selectListSummary,
  selectStatusBar,
  selectTodoListSummaries,
} from './selectors.js'

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

  it('derives Next Due Date from the earliest incomplete Todo only', () => {
    const summary = selectListSummary({
      id: 'release',
      title: 'Release',
      todos: [
        { id: 'done', text: 'Done', completed: true, dueDate: '2026-08-01' },
        { id: 'later', text: 'Later', completed: false, dueDate: '2026-08-20' },
        { id: 'next', text: 'Next', completed: false, dueDate: '2026-08-10' },
        { id: 'none', text: 'No date', completed: false, dueDate: null },
      ],
    })

    assert.equal(summary.nextDueDate, '2026-08-10')
  })

  it('orders due, undated, and completed Todo Lists with stable ties', () => {
    /** @param {string} id @param {boolean} completed @param {string | null} [dueDate] */
    const todo = (id, completed, dueDate = null) => ({
      id,
      text: id,
      completed,
      dueDate,
    })
    const readModel = {
      undated: { id: 'undated', title: 'Undated', todos: [todo('u', false)] },
      completed: { id: 'completed', title: 'Completed', todos: [todo('c', true, '2026-07-01')] },
      later: { id: 'later', title: 'Later', todos: [todo('l', false, '2026-08-20')] },
      dueTieOne: { id: 'dueTieOne', title: 'Tie one', todos: [todo('t1', false, '2026-08-10')] },
      empty: { id: 'empty', title: 'Empty', todos: [] },
      dueTieTwo: { id: 'dueTieTwo', title: 'Tie two', todos: [todo('t2', false, '2026-08-10')] },
      overdue: { id: 'overdue', title: 'Overdue', todos: [todo('o', false, '2026-07-15')] },
    }

    assert.deepEqual(
      selectTodoListSummaries(readModel).map((summary) => summary.id),
      ['overdue', 'dueTieOne', 'dueTieTwo', 'later', 'undated', 'empty', 'completed']
    )
  })

  it('projects every StatusBar priority without contradictory parts', () => {
    /**
     * @param {Partial<import('./types.js').TodoListSnapshot>} [overrides]
     * @returns {Pick<import('./types.js').TodoListSnapshot, 'status' | 'persistenceStatus' | 'syncStatus' | 'pendingTransactions' | 'rejectedTransactions' | 'error'>}
     */
    const snapshot = (overrides = {}) => ({
      status: /** @type {const} */ ('ready'),
      persistenceStatus: /** @type {const} */ ('idle'),
      syncStatus: /** @type {const} */ ('idle'),
      pendingTransactions: [],
      rejectedTransactions: [],
      error: null,
      ...overrides,
    })
    const visible = (overrides = {}) => {
      const status = selectStatusBar(snapshot(overrides))
      return {
        severity: status.severity,
        text: status.parts.map((part) => part.text).join(' | '),
        action: status.action,
        dismissible: status.dismissible,
      }
    }

    assert.deepEqual(visible({ status: 'loading' }), {
      severity: 'info',
      text: 'Things to do | Loading Todo Lists…',
      action: null,
      dismissible: false,
    })
    assert.deepEqual(visible({ status: 'error', error: 'boot failed' }), {
      severity: 'error',
      text: 'Things to do | Todo Lists could not be loaded',
      action: { label: 'Retry loading', event: 'RELOAD' },
      dismissible: false,
    })
    assert.deepEqual(visible({
      persistenceStatus: 'failed',
      syncStatus: 'failed',
      rejectedTransactions: [{ id: 'rejected', error: 'nope', code: 'bad' }],
      error: 'disk full',
    }), {
      severity: 'error',
      text: 'Things to do | Changes are not safely saved',
      action: { label: 'Retry local save', event: 'RETRY_PERSISTENCE' },
      dismissible: false,
    })
    assert.deepEqual(visible({
      rejectedTransactions: [{ id: 'rejected', listId: 'list', error: 'Invalid title', code: 'VALIDATION_ERROR' }],
    }), {
      severity: 'error',
      text: 'Things to do | A change could not be applied',
      action: { label: 'Review', event: 'REVIEW_REJECTION' },
      dismissible: true,
    })
    assert.deepEqual(visible({ syncStatus: 'failed', error: 'server down' }), {
      severity: 'warning',
      text: 'Things to do | Saved on this device | Server sync failed',
      action: { label: 'Retry server synchronization', event: 'RETRY_SYNC' },
      dismissible: false,
    })
    assert.equal(visible({
      syncStatus: 'offline',
      pendingTransactions: [{ id: 'pending' }],
    }).text, 'Things to do | Saved on this device | Waiting for connection')
    assert.equal(
      visible({ syncStatus: 'offline' }).text,
      'Things to do | Offline | No unsynchronized changes'
    )
    assert.equal(
      visible({ persistenceStatus: 'writing' }).text,
      'Things to do | Saving on this device…'
    )
    assert.equal(
      visible({ pendingTransactions: [{ id: 'pending' }] }).text,
      'Things to do | Saved on this device | Synchronizing…'
    )
    assert.equal(visible().text, 'Things to do | All changes saved')
  })
})
