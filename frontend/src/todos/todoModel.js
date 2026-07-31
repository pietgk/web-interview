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

/** Compare calendar dates only (local), injectable now for tests. */
export const formatDueStatus = (dueDate, now = new Date()) => {
  if (!dueDate) return null

  const due = parseDateOnly(dueDate)
  if (Number.isNaN(due.getTime())) return null

  const today = startOfLocalDay(now)
  const diffDays = Math.round((due - today) / MS_PER_DAY)

  if (diffDays === 0) return 'Due today'
  if (diffDays === 1) return '1 day remaining'
  if (diffDays > 1) return `${diffDays} days remaining`
  if (diffDays === -1) return '1 day overdue'
  return `${Math.abs(diffDays)} days overdue`
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

const startOfLocalDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate())

const parseDateOnly = (value) => {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}
