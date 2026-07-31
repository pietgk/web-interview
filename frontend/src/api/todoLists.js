const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3001'

const parseJson = async (response) => {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`)
  }
  return data
}

export const fetchTodoLists = async () => {
  const response = await fetch(`${API_BASE}/api/todo-lists`)
  return parseJson(response)
}

export const saveTodoList = async (id, { todos }) => {
  const response = await fetch(`${API_BASE}/api/todo-lists/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ todos }),
  })
  return parseJson(response)
}
