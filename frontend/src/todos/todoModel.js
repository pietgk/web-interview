/**
 * @typedef {object} Todo
 * @property {string} id
 * @property {string} text
 * @property {boolean} completed
 * @property {string | null} dueDate
 */

/** @returns {string} */
const newTodoId = () => {
  const cryptoApi = typeof crypto !== 'undefined' ? crypto : undefined
  return (
    cryptoApi?.randomUUID?.() ??
    `todo-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )
}

/**
 * @param {Partial<Todo>} [options]
 * @returns {Todo}
 */
export const createTodo = ({
  id = newTodoId(),
  text = '',
  completed = false,
  dueDate = null,
} = {}) => ({
  id,
  text,
  completed,
  dueDate,
})

export const isListCompleted = (todos = []) =>
  todos.length > 0 && todos.every((todo) => todo.completed)

/** Empty draft rows with no attributes are dematerialized (not persisted). */
export const isDematerializableTodo = (todo) =>
  !String(todo?.text ?? '').trim() && !todo?.completed && todo?.dueDate == null

export const updateTodoAt = (todos, index, patch) =>
  todos.map((todo, i) => (i === index ? { ...todo, ...patch } : todo))

export const removeTodoAt = (todos, index) => [
  ...todos.slice(0, index),
  ...todos.slice(index + 1),
]

const MS_PER_DAY = 24 * 60 * 60 * 1000
const AVERAGE_DAYS_PER_MONTH = 365.2425 / 12
const AVERAGE_DAYS_PER_YEAR = 365.2425
const DAYS_BEFORE_MONTHS = 45
const DAYS_BEFORE_YEARS = 548

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', {
  numeric: 'always',
})

const startOfLocalDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate())

const parseDateOnly = (value) => {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

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

const dueLabel = (days, value, unit) => {
  if (days > 0) {
    return `Due ${relativeTimeFormatter.format(value, unit)}`
  }

  return `${value} ${unit}${value === 1 ? '' : 's'} overdue`
}

/**
 * Structured due-date status for display.
 * Completed todos are never described as overdue/remaining.
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
