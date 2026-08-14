import { z } from 'zod'
import { ATTRIBUTE } from '@web-interview/todos/datom'
import {
  TODO_LIST_TITLE_MAX_LENGTH,
  TODO_TEXT_MAX_LENGTH,
} from '@web-interview/todos/protocol'
import { listId, todoId, ulid } from '@web-interview/todos/ulid'
import type { Datom } from '@web-interview/todos/types'

/**
 * The seed carries no ids. Entity ids are ULIDs minted by the server, so seeded
 * Todo Lists and Todos order themselves exactly like the ones users create.
 */
export const seedTodoListsSchema = z.array(
  z
    .object({
      title: z.string().trim().min(1).max(TODO_LIST_TITLE_MAX_LENGTH),
      todos: z
        .array(
          z
            .object({
              text: z.string().max(TODO_TEXT_MAX_LENGTH),
              completed: z.boolean().default(false),
              dueDate: z.string().nullable().default(null),
            })
            .strict()
        )
        .default([]),
    })
    .strict()
)

export type SeedTodoLists = z.infer<typeof seedTodoListsSchema>

export const createSeedTodoLists = (): SeedTodoLists => [
  {
    title: 'First List',
    todos: [{ text: 'First todo of first list!', completed: false, dueDate: null }],
  },
  {
    title: 'Second List',
    todos: [{ text: 'First todo of second list!', completed: false, dueDate: null }],
  },
]

export const seedDatoms = (todoLists: SeedTodoLists, seededAt: number): Datom[] => {
  const datoms: Datom[] = []
  for (const todoList of todoLists) {
    const list = listId(seededAt)
    datoms.push([list, ATTRIBUTE.TITLE, todoList.title.trim(), ulid(seededAt), true])
    // Todos project newest first, so the seed order is minted back to front.
    for (const todo of [...todoList.todos].reverse()) {
      const entity = todoId(list, seededAt)
      datoms.push([entity, ATTRIBUTE.TEXT, todo.text, ulid(seededAt), true])
      if (todo.completed) {
        datoms.push([entity, ATTRIBUTE.COMPLETED, true, ulid(seededAt), true])
      }
      if (todo.dueDate) {
        datoms.push([entity, ATTRIBUTE.DUE_DATE, todo.dueDate, ulid(seededAt), true])
      }
    }
  }
  return datoms
}
