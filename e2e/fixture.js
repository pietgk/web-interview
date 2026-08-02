export const PRIMARY_LIST_ID = 'e2e-primary-list'
export const PRIMARY_LIST_TITLE = 'E2E Primary List'
export const SECONDARY_LIST_ID = 'e2e-secondary-list'
export const SECONDARY_LIST_TITLE = 'E2E Secondary List'

export const PRIMARY_TODO = Object.freeze({
  id: 'e2e-primary-todo',
  text: 'First E2E todo',
  completed: false,
  dueDate: null,
})

export const E2E_SEED_TODO_LISTS = Object.freeze({
  [PRIMARY_LIST_ID]: {
    id: PRIMARY_LIST_ID,
    title: PRIMARY_LIST_TITLE,
    todos: [PRIMARY_TODO],
  },
  [SECONDARY_LIST_ID]: {
    id: SECONDARY_LIST_ID,
    title: SECONDARY_LIST_TITLE,
    todos: [
      {
        id: 'e2e-secondary-todo',
        text: 'Second E2E todo',
        completed: false,
        dueDate: null,
      },
    ],
  },
})
