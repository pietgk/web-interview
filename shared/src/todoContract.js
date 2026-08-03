import { z } from 'zod'
import { isRealCalendarDate } from './calendarDate.js'
import {
  ERROR_CODE,
  TODO_LIST_TITLE_MAX_LENGTH,
  TODO_TEXT_MAX_LENGTH,
} from './todoProtocol.js'

/** @typedef {import('./types.js').TodoList} TodoList */
/** @typedef {import('./types.js').TodoLists} TodoLists */
/** @typedef {import('./types.js').RejectedTransaction} RejectedTransaction */
/** @typedef {{path: (string | number)[], message: string}} ValidationIssue */
/** @typedef {{error: string, code: typeof ERROR_CODE.VALIDATION, issues: ValidationIssue[]}} ValidationErrorBody */
/** @template T @typedef {{ok: true, data: T, body?: never} | {ok: false, body: ValidationErrorBody, data?: never}} ParseResult */
/** @typedef {{basis: number, todoLists: TodoLists}} TodoReadModelResponse */
/** @typedef {TodoReadModelResponse & {acceptedTransactionIds: string[], rejectedTransactions: RejectedTransaction[]}} TodoSyncResponse */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export const dueDateSchema = z.union([
  z.null(),
  z
    .string()
    .regex(DATE_ONLY, 'dueDate must be YYYY-MM-DD')
    .refine(isRealCalendarDate, 'dueDate must be a real calendar date'),
])

export const todoSchema = z
  .object({
    id: z.string().min(1, 'todo id must be a non-empty string'),
    text: z.string().max(
      TODO_TEXT_MAX_LENGTH,
      `todo text must be at most ${TODO_TEXT_MAX_LENGTH} characters`
    ),
    completed: z.boolean(),
    dueDate: dueDateSchema,
  })
  .strict()

export const todosSchema = z.array(todoSchema).superRefine((todos, ctx) => {
  const seen = new Set()
  for (let index = 0; index < todos.length; index += 1) {
    const id = todos[index].id
    if (seen.has(id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate todo id: ${id}`,
        path: [index, 'id'],
      })
    }
    seen.add(id)
  }
})

export const todoListSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(1).max(TODO_LIST_TITLE_MAX_LENGTH),
    todos: todosSchema,
  })
  .strict()

export const todoListsSchema = z.record(z.string(), todoListSchema)

export const todoReadModelResponseSchema = z
  .object({
    basis: z.number().int().nonnegative(),
    todoLists: todoListsSchema,
  })
  .strict()

export const todoSyncResponseSchema = todoReadModelResponseSchema.extend({
  acceptedTransactionIds: z.array(z.string().min(1)),
  rejectedTransactions: z.array(
    z
      .object({
        id: z.string().min(1),
        listId: z.string().min(1).optional(),
        error: z.string(),
        code: z.string(),
        issues: z.array(z.unknown()).optional(),
      })
      .strict()
  ),
})

/**
 * @param {z.ZodError<unknown>} error
 * @returns {ValidationIssue[]}
 */
export const formatZodIssues = (error) =>
  error.issues.map((issue) => ({
    path: issue.path,
    message: issue.message,
  }))

/**
 * @param {z.ZodError<unknown>} error
 * @param {string} [message]
 * @returns {ValidationErrorBody}
 */
export const validationErrorBody = (error, message = 'Validation failed') => ({
  error: message,
  code: ERROR_CODE.VALIDATION,
  issues: formatZodIssues(error),
})

/**
 * @param {unknown} data
 * @returns {ParseResult<TodoLists>}
 */
export const parseTodoLists = (data) => {
  const result = todoListsSchema.safeParse(data)
  if (!result.success) {
    return { ok: false, body: validationErrorBody(result.error, 'Invalid todo lists response') }
  }
  return { ok: true, data: result.data }
}

/**
 * @param {unknown} data
 * @returns {ParseResult<TodoList>}
 */
export const parseTodoList = (data) => {
  const result = todoListSchema.safeParse(data)
  if (!result.success) {
    return { ok: false, body: validationErrorBody(result.error, 'Invalid todo list response') }
  }
  return { ok: true, data: result.data }
}

/**
 * @param {unknown} data
 * @returns {ParseResult<TodoReadModelResponse>}
 */
export const parseTodoReadModelResponse = (data) => {
  const result = todoReadModelResponseSchema.safeParse(data)
  if (!result.success) {
    return {
      ok: false,
      body: validationErrorBody(result.error, 'Invalid todo read-model response'),
    }
  }
  return { ok: true, data: result.data }
}

/**
 * @param {unknown} data
 * @returns {ParseResult<TodoSyncResponse>}
 */
export const parseTodoSyncResponse = (data) => {
  const result = todoSyncResponseSchema.safeParse(data)
  if (!result.success) {
    return {
      ok: false,
      body: validationErrorBody(result.error, 'Invalid todo sync response'),
    }
  }
  return { ok: true, data: result.data }
}
