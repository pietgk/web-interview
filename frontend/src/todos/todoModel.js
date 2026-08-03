/** @typedef {import('@web-interview/todos/types').Todo} Todo */
/** @typedef {Partial<Pick<Todo, 'text' | 'completed' | 'dueDate'>>} TodoPatch */
/** @typedef {'day' | 'month' | 'year'} RelativeDueUnit */
/**
 * @typedef {object} DueStatus
 * @property {'completed' | 'overdue' | 'remaining' | 'today'} kind
 * @property {string} label
 * @property {number | null} days
 * @property {number | null} value
 * @property {RelativeDueUnit | null} unit
 */

/** @param {Todo[]} [todos] */
export const isListCompleted = (todos = []) =>
  todos.length > 0 && todos.every((todo) => todo.completed)

/**
 * `text` is a Todo's defining attribute, so a ghost composer that settles blank
 * has nothing to assert and takes its Todo away with it.
 *
 * @param {Pick<Todo, 'text'>} todo
 */
export const isDematerializableTodo = (todo) => !String(todo?.text ?? '').trim()

const MS_PER_DAY = 24 * 60 * 60 * 1000
const AVERAGE_DAYS_PER_MONTH = 365.2425 / 12
const AVERAGE_DAYS_PER_YEAR = 365.2425
const DAYS_BEFORE_MONTHS = 45
const DAYS_BEFORE_YEARS = 548

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', {
  numeric: 'always',
})

/** @param {Date} date */
const startOfLocalDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate())

/** @param {string} value */
const parseDateOnly = (value) => {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * @param {number} days
 * @returns {{value: number, unit: RelativeDueUnit}}
 */
const relativeDueDuration = (days) => {
  const absoluteDays = Math.abs(days)

  if (absoluteDays < DAYS_BEFORE_MONTHS) {
    return { value: absoluteDays, unit: 'day' }
  }
  if (absoluteDays < DAYS_BEFORE_YEARS) {
    return {
      value: Math.round(absoluteDays / AVERAGE_DAYS_PER_MONTH),
      unit: 'month',
    }
  }
  return {
    value: Math.round(absoluteDays / AVERAGE_DAYS_PER_YEAR),
    unit: 'year',
  }
}

/**
 * @param {number} days
 * @param {number} value
 * @param {RelativeDueUnit} unit
 */
const dueLabel = (days, value, unit) => {
  if (days > 0) {
    return `Due ${relativeTimeFormatter.format(value, unit)}`
  }

  return `${value} ${unit}${value === 1 ? '' : 's'} overdue`
}

/**
 * Structured due-date status for display.
 * Completed todos are never described as overdue/remaining.
 * @param {string | null} dueDate
 * @param {{completed?: boolean, now?: Date}} [options]
 * @returns {DueStatus | null}
 */
export const getDueStatus = (dueDate, { completed = false, now = new Date() } = {}) => {
  if (completed) {
    return {
      kind: 'completed',
      label: 'Completed',
      days: null,
      value: null,
      unit: null,
    }
  }
  if (!dueDate) return null

  const due = parseDateOnly(dueDate)
  if (Number.isNaN(due.getTime())) return null

  const today = startOfLocalDay(now)
  const days = Math.round((due.getTime() - today.getTime()) / MS_PER_DAY)

  if (days === 0) {
    return { kind: 'today', label: 'Due today', days: 0, value: 0, unit: 'day' }
  }

  const { value, unit } = relativeDueDuration(days)
  return {
    kind: days > 0 ? 'remaining' : 'overdue',
    label: dueLabel(days, value, unit),
    days,
    value,
    unit,
  }
}
