import { describe, it } from 'vitest'
import assert from 'node:assert/strict'
import {
  isTodoListCompleted,
  selectListSummary,
  selectStatusBar,
  selectTodoListSummaries,
} from './selectors.js'

describe('todo-list selectors', () => {
  describe('isTodoListCompleted', () => {
    /** @param {string} id @param {boolean} completed */
    const todo = (id, completed) => ({ id, text: id, completed, dueDate: null })

    it('is false for an empty Todo List', () => {
      assert.equal(isTodoListCompleted([]), false)
    })

    it('is true when every Todo is completed', () => {
      assert.equal(
        isTodoListCompleted([todo('first', true), todo('second', true)]),
        true
      )
    })

    it('is false when any Todo is incomplete', () => {
      assert.equal(
        isTodoListCompleted([todo('first', true), todo('second', false)]),
        false
      )
    })
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
    /** @param {Partial<import('./types.js').TodoClientStatus>} [overrides] */
    const visible = (overrides = {}) => {
      const status = selectStatusBar({
        connection: 'live',
        pendingCount: 0,
        saving: false,
        canEdit: true,
        rehydrating: false,
        failure: null,
        epoch: 'epoch',
        ...overrides,
      })
      return {
        severity: status.severity,
        text: status.parts.map((part) => part.text).join(' | '),
        action: status.action,
      }
    }

    assert.deepEqual(visible({ connection: 'connecting' }), {
      severity: 'info',
      text: 'Things to do | Connecting…',
      action: null,
    })
    assert.deepEqual(visible({ connection: 'failed' }), {
      severity: 'error',
      text: 'Things to do | Connection lost',
      action: { label: 'Reconnect', event: 'RECONNECT' },
    })
    assert.deepEqual(visible({ connection: 'reconnecting' }), {
      severity: 'warning',
      text: 'Things to do | Connection lost | Reconnecting…',
      action: null,
    })
    assert.equal(
      visible({ connection: 'reconnecting', pendingCount: 2, saving: true }).text,
      'Things to do | Connection lost | Waiting for connection'
    )
    assert.deepEqual(visible({ pendingCount: 1, saving: true }), {
      severity: 'info',
      text: 'Things to do | Saving…',
      action: null,
    })
    assert.deepEqual(
      visible({
        pendingCount: 1,
        saving: true,
        failure: {
          kind: 'network',
          status: null,
          code: 'NETWORK_ERROR',
          message: 'Could not reach the server',
          issues: [],
        },
      }),
      {
        severity: 'warning',
        text: 'Things to do | Waiting for connection',
        action: null,
      },
      'an outbox that cannot drain is not "saving", even while the stream is up'
    )
    assert.deepEqual(
      visible({
        pendingCount: 0,
        failure: {
          kind: 'api',
          status: 400,
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          issues: [{ path: ['datoms', 0, 2], message: 'Invalid Todo text' }],
        },
      }),
      {
        severity: 'error',
        text: 'Things to do | Changes not saved',
        action: null,
      },
      'a permanent rejection remains visible after the rejected batch leaves the outbox'
    )
    assert.equal(
      visible({ pendingCount: 1, saving: false }).text,
      'Things to do | All changes saved',
      'a pending outbox stays silent until it has been pending long enough to matter'
    )
    assert.deepEqual(visible(), {
      severity: 'success',
      text: 'Things to do | All changes saved',
      action: null,
    })
  })
})
