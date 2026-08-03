import { z } from 'zod'
import { isRealCalendarDate } from './calendarDate.js'
import {
  TODO_LIST_TITLE_MAX_LENGTH,
  TODO_TEXT_MAX_LENGTH,
} from './todoProtocol.js'
import {
  TODO_ID_PATTERN,
  TODO_LIST_ID_PATTERN,
  ULID_PATTERN,
} from './ulid.js'

/** @typedef {import('./types.js').Attribute} Attribute */
/** @typedef {import('./types.js').Datom} Datom */
/** @typedef {import('./types.js').EntityType} EntityType */
/** @typedef {import('./types.js').FactValue} FactValue */

export const ENTITY_TYPE = Object.freeze({
  TODO_LIST: 'Todo List',
  TODO: 'Todo',
})

export const ATTRIBUTE = Object.freeze({
  TITLE: 'title',
  TEXT: 'text',
  COMPLETED: 'completed',
  DUE_DATE: 'dueDate',
})

const ATTRIBUTE_VALUES = /** @type {const} */ ([
  'title',
  'text',
  'completed',
  'dueDate',
])

/**
 * Each entity type declares one defining attribute. Asserting it creates the
 * entity, retracting it deletes the entity, and re-asserting it brings the
 * entity's other attributes back with it.
 *
 * @type {Readonly<Record<Attribute, {entity: EntityType, defining: boolean, isValidValue: (value: unknown) => boolean}>>}
 */
const ATTRIBUTES = Object.freeze({
  [ATTRIBUTE.TITLE]: {
    entity: ENTITY_TYPE.TODO_LIST,
    defining: true,
    isValidValue: (value) =>
      typeof value === 'string' &&
      value.trim().length > 0 &&
      value.trim().length <= TODO_LIST_TITLE_MAX_LENGTH,
  },
  [ATTRIBUTE.TEXT]: {
    entity: ENTITY_TYPE.TODO,
    defining: true,
    isValidValue: (value) =>
      typeof value === 'string' && value.length <= TODO_TEXT_MAX_LENGTH,
  },
  [ATTRIBUTE.COMPLETED]: {
    entity: ENTITY_TYPE.TODO,
    defining: false,
    isValidValue: (value) => typeof value === 'boolean',
  },
  [ATTRIBUTE.DUE_DATE]: {
    entity: ENTITY_TYPE.TODO,
    defining: false,
    isValidValue: isRealCalendarDate,
  },
})

export const DEFINING_ATTRIBUTE = Object.freeze({
  [ENTITY_TYPE.TODO_LIST]: ATTRIBUTE.TITLE,
  [ENTITY_TYPE.TODO]: ATTRIBUTE.TEXT,
})

/**
 * @param {string} entity
 * @returns {EntityType | null}
 */
export const entityTypeOf = (entity) => {
  if (TODO_LIST_ID_PATTERN.test(entity)) return ENTITY_TYPE.TODO_LIST
  if (TODO_ID_PATTERN.test(entity)) return ENTITY_TYPE.TODO
  return null
}

/**
 * The Todo List a Todo belongs to for its whole life, read straight off its id.
 *
 * @param {string} todoEntity
 * @returns {string}
 */
export const listEntityOf = (todoEntity) => todoEntity.slice(0, todoEntity.indexOf('/'))

export const datomSchema = z
  .tuple([
    z.string(),
    z.enum(ATTRIBUTE_VALUES),
    z.union([z.string(), z.number(), z.boolean()]),
    z.string().regex(ULID_PATTERN, 'Transaction id must be a ULID'),
    z.boolean(),
  ])
  .superRefine(([entity, attribute, value], ctx) => {
    const entityType = entityTypeOf(entity)
    if (!entityType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Not a Todo List or Todo id: ${entity}`,
        path: [0],
      })
      return
    }

    const definition = ATTRIBUTES[attribute]
    if (definition.entity !== entityType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Attribute ${attribute} belongs to a ${definition.entity}, not a ${entityType}`,
        path: [1],
      })
    }
    if (!definition.isValidValue(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid value for ${attribute} on ${entity}`,
        path: [2],
      })
    }
  })

export const datomsRequestSchema = z
  .object({ datoms: z.array(datomSchema).min(1) })
  .strict()
