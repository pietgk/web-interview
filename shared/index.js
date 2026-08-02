import { z } from 'zod'

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const MAX_TODO_TEXT = 1000

const isRealCalendarDate = (value) => {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  )
}

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
    text: z.string().max(MAX_TODO_TEXT, `todo text must be at most ${MAX_TODO_TEXT} characters`),
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
    title: z.string(),
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

export const updateTodosRequestSchema = z
  .object({
    todos: todosSchema,
  })
  .strict()

export const formatZodIssues = (error) =>
  error.issues.map((issue) => ({
    path: issue.path,
    message: issue.message,
  }))

export const validationErrorBody = (error, message = 'Validation failed') => ({
  error: message,
  code: 'VALIDATION_ERROR',
  issues: formatZodIssues(error),
})

export const parseUpdateTodosRequest = (body) => {
  const result = updateTodosRequestSchema.safeParse(body ?? {})
  if (!result.success) {
    return { ok: false, body: validationErrorBody(result.error) }
  }
  return { ok: true, data: result.data }
}

export const parseTodoLists = (data) => {
  const result = todoListsSchema.safeParse(data)
  if (!result.success) {
    return { ok: false, body: validationErrorBody(result.error, 'Invalid todo lists response') }
  }
  return { ok: true, data: result.data }
}

export const parseTodoList = (data) => {
  const result = todoListSchema.safeParse(data)
  if (!result.success) {
    return { ok: false, body: validationErrorBody(result.error, 'Invalid todo list response') }
  }
  return { ok: true, data: result.data }
}

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

export {
  ATTRIBUTE,
  applyTransaction,
  createEmptyDatabase,
  databaseFromReadModel,
  datomSchema,
  projectTodoLists,
  readModelAsOf,
  replayTransactions,
  syncTodoListsRequestSchema,
  transactionSchema,
} from './src/todoDatabase.js'

export {
  createTodoTransaction,
  createTransaction,
  deleteTodoTransaction,
  newTodoId,
  patchTodoTransaction,
  replaceTodoListTransaction,
  seedTransactionFromTodoLists,
} from './src/transactions.js'

export {
  createTodoListActor,
  SYNC_DEBOUNCE_MS,
  TodoListActor,
} from './src/todoListActor.js'

export {
  hasLocallyUndurableChanges,
  isListCompleted,
  selectListSaveChrome,
  selectListSummary,
  selectTodoLists,
} from './src/selectors.js'
