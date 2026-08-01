import { parseTodoList, parseTodoLists } from '@web-interview/todo-contract'

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3001'

const readErrorMessage = (data, status) => {
  if (data?.error) return data.error
  return `Request failed with status ${status}`
}

const parseJson = async (response) => {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(readErrorMessage(data, response.status))
    error.status = response.status
    error.body = data
    throw error
  }
  return data
}

export const fetchTodoLists = async ({ signal } = {}) => {
  const response = await fetch(`${API_BASE}/api/todo-lists`, { signal })
  const data = await parseJson(response)
  const parsed = parseTodoLists(data)
  if (!parsed.ok) {
    throw new Error(parsed.body.error || 'Invalid todo lists response')
  }
  return parsed.data
}

export const saveTodoList = async (id, { todos }) => {
  const response = await fetch(`${API_BASE}/api/todo-lists/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ todos }),
  })
  const data = await parseJson(response)
  const parsed = parseTodoList(data)
  if (!parsed.ok) {
    throw new Error(parsed.body.error || 'Invalid todo list response')
  }
  return parsed.data
}
