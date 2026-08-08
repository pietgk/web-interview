import { getDueStatus, isDematerializableTodo } from './todoModel'

/** @param {Partial<import('@web-interview/todos/types').Todo>} [overrides] */
const todo = (overrides = {}) => ({
  id: 'todo',
  text: '',
  completed: false,
  dueDate: null,
  ...overrides,
})

describe('todoModel', () => {
  describe('isDematerializableTodo', () => {
    it('is true for blank text', () => {
      expect(isDematerializableTodo(todo({ text: '   ' }))).toBe(true)
    })

    it('is false as soon as there is text to keep', () => {
      expect(isDematerializableTodo(todo({ text: 'Ship it' }))).toBe(false)
    })

    it('ignores completed and dueDate, which cannot keep a Todo alive on their own', () => {
      expect(isDematerializableTodo(todo({ completed: true }))).toBe(true)
      expect(isDematerializableTodo(todo({ dueDate: '2099-01-01' }))).toBe(true)
    })
  })

  describe('getDueStatus', () => {
    const now = new Date(2026, 6, 31) // 31 Jul 2026 local

    it.each([
      [null, false, null],
      ['not-a-date', false, null],
      [
        '2026-07-31',
        false,
        { kind: 'today', label: 'Due today', days: 0, value: 0, unit: 'day' },
      ],
      [
        '2026-08-01',
        false,
        { kind: 'remaining', label: 'Due in 1 day', days: 1, value: 1, unit: 'day' },
      ],
      [
        '2026-08-03',
        false,
        { kind: 'remaining', label: 'Due in 3 days', days: 3, value: 3, unit: 'day' },
      ],
      [
        '2026-07-30',
        false,
        { kind: 'overdue', label: '1 day overdue', days: -1, value: 1, unit: 'day' },
      ],
      [
        '2026-07-28',
        false,
        { kind: 'overdue', label: '3 days overdue', days: -3, value: 3, unit: 'day' },
      ],
      [
        '2026-07-30',
        true,
        {
          kind: 'completed',
          label: 'Completed',
          days: null,
          value: null,
          unit: null,
        },
      ],
    ])('dueDate %s completed=%s', (dueDate, completed, expected) => {
      expect(getDueStatus(dueDate, { completed, now })).toEqual(expected)
    })

    it('does not describe a completed todo as overdue', () => {
      const status = getDueStatus('2026-07-30', { completed: true, now })
      if (!status) throw new Error('Expected a completed due-date status')
      expect(status.kind).toBe('completed')
      expect(status.label).not.toMatch(/overdue/i)
    })

    it.each([
      ['2026-09-13', 'Due in 44 days', 44, 'day'],
      ['2026-09-14', 'Due in 1 month', 1, 'month'],
      ['2028-01-29', 'Due in 18 months', 18, 'month'],
      ['2028-01-30', 'Due in 2 years', 2, 'year'],
      ['2099-01-15', 'Due in 72 years', 72, 'year'],
      ['2026-06-16', '1 month overdue', 1, 'month'],
      ['2025-01-29', '2 years overdue', 2, 'year'],
    ])('humanizes %s as %s', (dueDate, label, value, unit) => {
      expect(getDueStatus(dueDate, { now })).toMatchObject({ label, value, unit })
    })
  })
})
