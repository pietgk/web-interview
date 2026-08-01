export const createTodo = ({
  id = crypto.randomUUID(),
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

export const updateTodoAt = (todos, index, patch) =>
  todos.map((todo, i) => (i === index ? { ...todo, ...patch } : todo))

export const removeTodoAt = (todos, index) => [
  ...todos.slice(0, index),
  ...todos.slice(index + 1),
]

const MS_PER_DAY = 24 * 60 * 60 * 1000

const startOfLocalDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate())

const parseDateOnly = (value) => {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Structured due-date status for display.
 * Completed todos are never described as overdue/remaining.
 */
export const getDueStatus = (dueDate, { completed = false, now = new Date() } = {}) => {
  if (completed) {
    return { kind: 'completed', label: 'Completed', days: null }
  }
  if (!dueDate) return null

  const due = parseDateOnly(dueDate)
  if (Number.isNaN(due.getTime())) return null

  const today = startOfLocalDay(now)
  const days = Math.round((due - today) / MS_PER_DAY)

  if (days === 0) return { kind: 'today', label: 'Due today', days: 0 }
  if (days === 1) return { kind: 'remaining', label: '1 day remaining', days: 1 }
  if (days > 1) return { kind: 'remaining', label: `${days} days remaining`, days }
  if (days === -1) return { kind: 'overdue', label: '1 day overdue', days: -1 }
  return { kind: 'overdue', label: `${Math.abs(days)} days overdue`, days }
}

/** @deprecated Prefer getDueStatus for kind-aware rendering. */
export const formatDueStatus = (dueDate, now = new Date(), completed = false) => {
  const status = getDueStatus(dueDate, { completed, now })
  return status ? status.label : null
}
