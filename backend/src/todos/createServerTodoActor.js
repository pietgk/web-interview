import { fileURLToPath } from 'node:url'
import { createTodoListActor } from '@web-interview/todos/actor'
import { createSeedTodoLists } from '../seed.js'
import { JsonlJournalStorage } from './jsonlJournalStorage.js'

export const DEFAULT_TODO_LOG_PATH = fileURLToPath(
  new URL('../../data/todos.jsonl', import.meta.url)
)

export const createServerTodoActor = async ({
  filePath = DEFAULT_TODO_LOG_PATH,
  initialTodoLists = createSeedTodoLists(),
  now,
} = {}) => {
  const storage = new JsonlJournalStorage({ filePath, initialTodoLists, now })
  const actor = createTodoListActor({ storage })
  await actor.start()
  if (actor.getSnapshot().status !== 'ready') {
    throw new Error(actor.getSnapshot().error || 'Failed to start todo-list actor')
  }
  return actor
}
