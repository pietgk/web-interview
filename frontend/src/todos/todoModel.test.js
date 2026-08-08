import { getDueStatus, isDematerializableTodo } from './todoModel'

const FAR_FUTURE_DUE_DAY = '2099-01-01'
const TODAY = '2026-07-31'
const TOMORROW = '2026-08-01'
const THREE_DAYS_LATER = '2026-08-03'
const YESTERDAY = '2026-07-30'
const THREE_DAYS_EARLIER = '2026-07-28'
const FORTY_FOUR_DAYS_LATER = '2026-09-13'
const ONE_MONTH_LATER = '2026-09-14'
const EIGHTEEN_MONTHS_LATER = '2028-01-29'
const TWO_YEARS_LATER = '2028-01-30'
const SEVENTY_TWO_YEARS_LATER = '2099-01-15'
const ONE_MONTH_EARLIER = '2026-06-16'
const TWO_YEARS_EARLIER = '2025-01-29'

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
      expect(isDematerializableTodo(todo({ dueDate: FAR_FUTURE_DUE_DAY }))).toBe(true)
    })
  })

  describe('getDueStatus', () => {
    const today = TODAY

    it.each([
      [null, false, null],
      ['not-a-date', false, null],
      [
        TODAY,
        false,
        { kind: 'today', label: 'Due today', days: 0, value: 0, unit: 'day' },
      ],
      [
        TOMORROW,
        false,
        { kind: 'remaining', label: 'Due in 1 day', days: 1, value: 1, unit: 'day' },
      ],
      [
        THREE_DAYS_LATER,
        false,
        { kind: 'remaining', label: 'Due in 3 days', days: 3, value: 3, unit: 'day' },
      ],
      [
        YESTERDAY,
        false,
        { kind: 'overdue', label: '1 day overdue', days: -1, value: 1, unit: 'day' },
      ],
      [
        THREE_DAYS_EARLIER,
        false,
        { kind: 'overdue', label: '3 days overdue', days: -3, value: 3, unit: 'day' },
      ],
      [
        YESTERDAY,
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
      expect(getDueStatus(dueDate, { completed, today })).toEqual(expected)
    })

    it('does not describe a completed todo as overdue', () => {
      const status = getDueStatus(YESTERDAY, { completed: true, today })
      if (!status) throw new Error('Expected a completed due-date status')
      expect(status.kind).toBe('completed')
      expect(status.label).not.toMatch(/overdue/i)
    })

    it.each([
      [FORTY_FOUR_DAYS_LATER, 'Due in 44 days', 44, 'day'],
      [ONE_MONTH_LATER, 'Due in 1 month', 1, 'month'],
      [EIGHTEEN_MONTHS_LATER, 'Due in 18 months', 18, 'month'],
      [TWO_YEARS_LATER, 'Due in 2 years', 2, 'year'],
      [SEVENTY_TWO_YEARS_LATER, 'Due in 72 years', 72, 'year'],
      [ONE_MONTH_EARLIER, '1 month overdue', 1, 'month'],
      [TWO_YEARS_EARLIER, '2 years overdue', 2, 'year'],
    ])('humanizes %s as %s', (dueDate, label, value, unit) => {
      expect(getDueStatus(dueDate, { today })).toMatchObject({ label, value, unit })
    })
  })
})
