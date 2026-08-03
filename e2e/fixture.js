export const PRIMARY_LIST_TITLE = 'E2E Primary List'
export const SECONDARY_LIST_TITLE = 'E2E Secondary List'
export const PRIMARY_TODO_TEXT = 'First E2E todo'

/**
 * The seed carries no ids: entity ids are ULIDs the server mints, so seeded Todo
 * Lists order themselves exactly like the ones a user creates.
 */
export const E2E_SEED_TODO_LISTS = Object.freeze([
  {
    title: PRIMARY_LIST_TITLE,
    todos: [{ text: PRIMARY_TODO_TEXT, completed: false, dueDate: null }],
  },
  {
    title: SECONDARY_LIST_TITLE,
    todos: [{ text: 'Second E2E todo', completed: false, dueDate: null }],
  },
])
