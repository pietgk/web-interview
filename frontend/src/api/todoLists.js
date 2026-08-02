import {
  parseTodoReadModelResponse,
  parseTodoSyncResponse,
} from '@web-interview/todos/contract'
import { ERROR_CODE, TODO_API_PATH } from '@web-interview/todos/protocol'

const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')

/**
 * @typedef {object} ApiErrorOptions
 * @property {string} message
 * @property {number | null} [status]
 * @property {string} code
 * @property {unknown[]} [issues]
 * @property {unknown} [cause]
 */

export class ApiError extends Error {
  /** @param {ApiErrorOptions} options */
  constructor({ message, status = null, code, issues = [], cause }) {
    super(message, { cause })
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.issues = issues
  }
}

/**
 * @param {string} path
 * @param {RequestInit} [options]
 */
const requestJson = async (path, options = {}) => {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, options)
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new ApiError({
      message: 'Network error',
      code: ERROR_CODE.NETWORK,
      cause: error,
    })
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new ApiError({
      message: data?.error || `Request failed with status ${response.status}`,
      status: response.status,
      code: data?.code || ERROR_CODE.INVALID_ERROR_RESPONSE,
      issues: Array.isArray(data?.issues) ? data.issues : [],
    })
  }
  return { data, status: response.status }
}

/** @param {{signal?: AbortSignal}} [options] */
export const fetchTodoReadModel = async ({ signal } = {}) => {
  const { data, status } = await requestJson(TODO_API_PATH.READ_MODEL, { signal })
  const parsed = parseTodoReadModelResponse(data)
  if (!parsed.ok) {
    throw new ApiError({
      message: parsed.body.error,
      status,
      code: ERROR_CODE.INVALID_RESPONSE,
      issues: parsed.body.issues,
    })
  }
  return parsed.data
}

/** @param {{basis: number, transactions: Array<{id: string}>, signal?: AbortSignal}} options */
export const syncTodoLists = async ({ basis, transactions, signal }) => {
  const { data, status } = await requestJson(TODO_API_PATH.SYNC, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ basis, transactions }),
  })
  const parsed = parseTodoSyncResponse(data)
  if (!parsed.ok) {
    throw new ApiError({
      message: parsed.body.error,
      status,
      code: ERROR_CODE.INVALID_RESPONSE,
      issues: parsed.body.issues,
    })
  }
  return parsed.data
}
