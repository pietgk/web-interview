import { z } from 'zod'
import { isRealCalendarDate } from './calendarDate.js'
import {
  ERROR_CODE,
  SYNC_TRANSACTION_LIMIT,
  TODO_TEXT_MAX_LENGTH,
  TRANSACTION_VERSION,
} from './todoProtocol.js'

/**
 * @typedef {Record<string, {
 *   id: string,
 *   title: string,
 *   todos: Array<{id: string, text: string, completed: boolean, dueDate: string | null}>
 * }>} TodoLists
 */

const ATTRIBUTE_VALUES = /** @type {const} */ ([
  'list/title',
  'list/order',
  'todo/list',
  'todo/text',
  'todo/completed',
  'todo/dueDate',
  'todo/order',
  'todo/deleted',
])

export const ATTRIBUTE = Object.freeze({
  LIST_TITLE: ATTRIBUTE_VALUES[0],
  LIST_ORDER: ATTRIBUTE_VALUES[1],
  TODO_LIST: ATTRIBUTE_VALUES[2],
  TODO_TEXT: ATTRIBUTE_VALUES[3],
  TODO_COMPLETED: ATTRIBUTE_VALUES[4],
  TODO_DUE_DATE: ATTRIBUTE_VALUES[5],
  TODO_ORDER: ATTRIBUTE_VALUES[6],
  TODO_DELETED: ATTRIBUTE_VALUES[7],
})

class TransactionValidationError extends Error {
  constructor(issues) {
    super('Invalid transaction')
    this.name = 'TransactionValidationError'
    this.code = ERROR_CODE.INVALID_TRANSACTION
    this.issues = issues
  }
}

const valueMatchesAttribute = (attribute, value) => {
  switch (attribute) {
    case ATTRIBUTE.LIST_TITLE:
      return typeof value === 'string'
    case ATTRIBUTE.LIST_ORDER:
    case ATTRIBUTE.TODO_ORDER:
      return typeof value === 'number' && Number.isFinite(value)
    case ATTRIBUTE.TODO_LIST:
      return typeof value === 'string' && value.length > 0
    case ATTRIBUTE.TODO_TEXT:
      return typeof value === 'string' && value.length <= TODO_TEXT_MAX_LENGTH
    case ATTRIBUTE.TODO_COMPLETED:
    case ATTRIBUTE.TODO_DELETED:
      return typeof value === 'boolean'
    case ATTRIBUTE.TODO_DUE_DATE:
      return isRealCalendarDate(value)
    default:
      return false
  }
}

export const datomSchema = z
  .tuple([
    z.string().min(1),
    z.enum(ATTRIBUTE_VALUES),
    z.union([z.string(), z.number(), z.boolean()]),
    z.string().min(1),
    z.boolean(),
  ])
  .superRefine(([entity, attribute, value], ctx) => {
    if (!valueMatchesAttribute(attribute, value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid value for ${attribute} on ${entity}`,
        path: [2],
      })
    }
  })

const originSchema = z
  .object({
    clientId: z.string().min(1),
    cause: z.string().min(1),
    listId: z.string().min(1).optional(),
    userId: z.string().min(1).optional(),
    undoOf: z.string().min(1).optional(),
  })
  .strict()

export const transactionSchema = z
  .object({
    version: z.literal(TRANSACTION_VERSION),
    id: z.string().min(1),
    basis: z.number().int().nonnegative(),
    serverSeq: z.number().int().positive().optional(),
    occurredAt: z.string().datetime(),
    serverAt: z.string().datetime().optional(),
    origin: originSchema,
    datoms: z.array(datomSchema).min(1),
  })

export const syncTodoListsRequestSchema = z
  .object({
    basis: z.number().int().nonnegative(),
    transactions: z.array(transactionSchema).max(SYNC_TRANSACTION_LIMIT),
  })
  .strict()
  .superRefine((request, ctx) => {
    request.transactions.forEach((transaction, transactionIndex) => {
      const additions = new Map()

      transaction.datoms.forEach((datom, datomIndex) => {
        const [entity, attribute, value, transactionId, added] = datom
        if (transactionId !== transaction.id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Datom transaction id must match its transaction envelope',
            path: ['transactions', transactionIndex, 'datoms', datomIndex, 3],
          })
        }

        if (!added) return
        const key = `${entity}\u0000${attribute}`
        const previous = additions.get(key)
        if (previous !== undefined && !Object.is(previous, value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'A cardinality-one attribute cannot add two values in one transaction',
            path: ['transactions', transactionIndex, 'datoms', datomIndex],
          })
        }
        additions.set(key, value)
      })
    })
  })

const cloneFacts = (facts) => {
  const clone = new Map()
  for (const [entity, attributes] of facts) {
    clone.set(entity, new Map(attributes))
  }
  return clone
}

const factValue = (facts, entity, attribute) => facts.get(entity)?.get(attribute)

const hasFact = (facts, entity, attribute) => facts.get(entity)?.has(attribute) ?? false

const setFact = (facts, entity, attribute, value) => {
  const attributes = facts.get(entity) ?? new Map()
  attributes.set(attribute, value)
  facts.set(entity, attributes)
}

const deleteFact = (facts, entity, attribute, value) => {
  const attributes = facts.get(entity)
  if (!attributes || !attributes.has(attribute)) return
  if (!Object.is(attributes.get(attribute), value)) return
  attributes.delete(attribute)
  if (attributes.size === 0) facts.delete(entity)
}

export const createEmptyDatabase = () => ({
  basis: 0,
  facts: new Map(),
  transactionIds: new Set(),
})

const validateDatabase = (facts) => {
  const listIds = new Set()

  for (const [entity, attributes] of facts) {
    if (attributes.has(ATTRIBUTE.LIST_TITLE)) {
      if (!attributes.has(ATTRIBUTE.LIST_ORDER)) {
        throw new Error(`List ${entity} is missing ${ATTRIBUTE.LIST_ORDER}`)
      }
      listIds.add(entity)
    }
  }

  for (const [entity, attributes] of facts) {
    if (!attributes.has(ATTRIBUTE.TODO_LIST)) continue
    const required = [
      ATTRIBUTE.TODO_TEXT,
      ATTRIBUTE.TODO_COMPLETED,
      ATTRIBUTE.TODO_ORDER,
      ATTRIBUTE.TODO_DELETED,
    ]
    for (const attribute of required) {
      if (!attributes.has(attribute)) {
        throw new Error(`Todo ${entity} is missing ${attribute}`)
      }
    }
    const listId = attributes.get(ATTRIBUTE.TODO_LIST)
    if (!listIds.has(listId)) {
      throw new Error(`Todo ${entity} references unknown list ${listId}`)
    }
  }
}

const datomKey = ([entity, attribute, value, , added]) =>
  JSON.stringify([entity, attribute, value, added])

export const applyTransaction = (database, input) => {
  const parsed = transactionSchema.safeParse(input)
  if (!parsed.success) {
    throw new TransactionValidationError(parsed.error.issues)
  }

  const transaction = parsed.data
  if (database.transactionIds.has(transaction.id)) {
    return { database, transaction, duplicate: true }
  }

  const facts = cloneFacts(database.facts)
  const normalized = []
  const seen = new Set()

  const appendDatom = (datom) => {
    const key = datomKey(datom)
    if (seen.has(key)) return
    seen.add(key)
    normalized.push(datom)
  }

  for (const datom of transaction.datoms) {
    const [entity, attribute, value, transactionId, added] = datom
    if (!added) {
      if (Object.is(factValue(database.facts, entity, attribute), value)) {
        appendDatom([entity, attribute, value, transactionId, false])
      }
      continue
    }

    if (hasFact(database.facts, entity, attribute)) {
      const previous = factValue(database.facts, entity, attribute)
      if (!Object.is(previous, value)) {
        appendDatom([entity, attribute, previous, transactionId, false])
      }
    }
    if (!Object.is(factValue(database.facts, entity, attribute), value)) {
      appendDatom([entity, attribute, value, transactionId, true])
    }
  }

  for (const datom of normalized.filter((entry) => !entry[4])) {
    deleteFact(facts, datom[0], datom[1], datom[2])
  }
  for (const datom of normalized.filter((entry) => entry[4])) {
    setFact(facts, datom[0], datom[1], datom[2])
  }

  validateDatabase(facts)

  const normalizedTransaction = { ...transaction, datoms: normalized }
  return {
    database: {
      basis: Math.max(database.basis, transaction.serverSeq ?? database.basis),
      facts,
      transactionIds: new Set([...database.transactionIds, transaction.id]),
    },
    transaction: normalizedTransaction,
    duplicate: false,
    noOp: normalized.length === 0,
  }
}

/** @returns {TodoLists} */
export const projectTodoLists = (database) => {
  const lists = []

  for (const [id, attributes] of database.facts) {
    if (!attributes.has(ATTRIBUTE.LIST_TITLE)) continue
    lists.push({
      id,
      title: attributes.get(ATTRIBUTE.LIST_TITLE),
      order: attributes.get(ATTRIBUTE.LIST_ORDER),
      todos: [],
    })
  }

  const byId = new Map(lists.map((list) => [list.id, list]))
  for (const [id, attributes] of database.facts) {
    if (!attributes.has(ATTRIBUTE.TODO_LIST)) continue
    if (attributes.get(ATTRIBUTE.TODO_DELETED)) continue
    const list = byId.get(attributes.get(ATTRIBUTE.TODO_LIST))
    if (!list) continue
    list.todos.push({
      id,
      text: attributes.get(ATTRIBUTE.TODO_TEXT),
      completed: attributes.get(ATTRIBUTE.TODO_COMPLETED),
      dueDate: attributes.get(ATTRIBUTE.TODO_DUE_DATE) ?? null,
      order: attributes.get(ATTRIBUTE.TODO_ORDER),
    })
  }

  lists.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
  /** @type {TodoLists} */
  const result = {}
  for (const list of lists) {
    list.todos.sort(
      (left, right) => left.order - right.order || left.id.localeCompare(right.id)
    )
    result[list.id] = {
      id: list.id,
      title: list.title,
      todos: list.todos.map(({ order, ...todo }) => todo),
    }
  }
  return result
}

export const databaseFromReadModel = (todoLists, basis = 0) => {
  const facts = new Map()
  let listOrder = 0

  for (const list of Object.values(todoLists)) {
    setFact(facts, list.id, ATTRIBUTE.LIST_TITLE, list.title)
    setFact(facts, list.id, ATTRIBUTE.LIST_ORDER, listOrder)
    list.todos.forEach((todo, todoOrder) => {
      setFact(facts, todo.id, ATTRIBUTE.TODO_LIST, list.id)
      setFact(facts, todo.id, ATTRIBUTE.TODO_TEXT, todo.text)
      setFact(facts, todo.id, ATTRIBUTE.TODO_COMPLETED, todo.completed)
      if (todo.dueDate != null) {
        setFact(facts, todo.id, ATTRIBUTE.TODO_DUE_DATE, todo.dueDate)
      }
      setFact(facts, todo.id, ATTRIBUTE.TODO_ORDER, todoOrder)
      setFact(facts, todo.id, ATTRIBUTE.TODO_DELETED, false)
    })
    listOrder += 1
  }

  validateDatabase(facts)
  return { basis, facts, transactionIds: new Set() }
}

export const replayTransactions = (transactions) => {
  let database = createEmptyDatabase()
  for (const transaction of transactions) {
    database = applyTransaction(database, transaction).database
  }
  return database
}

export const readModelAsOf = (transactions, basis) =>
  projectTodoLists(
    replayTransactions(
      transactions.filter((transaction) => (transaction.serverSeq ?? 0) <= basis)
    )
  )
