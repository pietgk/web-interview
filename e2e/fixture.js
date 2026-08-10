import { expect } from '@playwright/test'

export const PRIMARY_LIST_TITLE = 'E2E Primary List'
export const SECONDARY_LIST_TITLE = 'E2E Secondary List'
export const PRIMARY_TODO_TEXT = 'First E2E todo'

/**
 * Give each journey its own Todo List so parallel browser clients never contend
 * over the seeded fixtures.
 *
 * @param {string} prefix
 */
export const uniqueListTitle = (prefix) =>
  `${prefix} ${Date.now()} ${Math.random().toString(16).slice(2)}`

/** @param {import('@playwright/test').Page} page */
export const waitForApp = async (page) => {
  await expect(page.getByRole('button', { name: 'Add Todo List' })).toBeEnabled()
}

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
