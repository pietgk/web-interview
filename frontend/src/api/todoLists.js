import {
  parseTodoReadModelResponse,
  parseTodoSyncResponse,
} from '@web-interview/todos/contract'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001'

export class ApiError extends Error {
  constructor({ message, status = null, code, issues = [], cause }) {
    super(message, { cause })
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.issues = issues
  }
}

const requestJson = async (path, options = {}) => {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, options)
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new ApiError({
      message: 'Network error',
      code: 'NETWORK_ERROR',
      cause: error,
    })
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new ApiError({
      message: data?.error || `Request failed with status ${response.status}`,
      status: response.status,
      code: data?.code || 'INVALID_ERROR_RESPONSE',
      issues: Array.isArray(data?.issues) ? data.issues : [],
    })
  }
  return data
}

export const fetchTodoReadModel = async ({ signal } = {}) => {
  const data = await requestJson('/api/todo-lists/read-model', { signal })
  const parsed = parseTodoReadModelResponse(data)
  if (!parsed.ok) {
    throw new ApiError({
      message: parsed.body.error,
      status: 200,
      code: 'INVALID_RESPONSE',
      issues: parsed.body.issues,
    })
  }
  return parsed.data
}

export const syncTodoLists = async ({ basis, transactions, signal }) => {
  const data = await requestJson('/api/todo-lists/sync', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ basis, transactions }),
  })
  const parsed = parseTodoSyncResponse(data)
  if (!parsed.ok) {
    throw new ApiError({
      message: parsed.body.error,
      status: 200,
      code: 'INVALID_RESPONSE',
      issues: parsed.body.issues,
    })
  }
  return parsed.data
}
