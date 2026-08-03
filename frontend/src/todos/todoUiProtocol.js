/** @typedef {import('@web-interview/todos/types').Todo} Todo */
/** @typedef {Partial<Pick<Todo, 'text' | 'completed' | 'dueDate'>>} TodoPatch */
/** @typedef {{type: 'COMPOSER_CHANGE', text: string} | {type: 'COMPOSER_COMMIT' | 'COMPOSER_SUBMIT'} | {type: 'TODO_PATCH', id: string, patch: TodoPatch} | {type: 'TODO_REMOVE', id: string}} TodoUiEvent */

export const TODO_UI_EVENT = Object.freeze({
  COMPOSER_CHANGE: 'COMPOSER_CHANGE',
  COMPOSER_COMMIT: 'COMPOSER_COMMIT',
  COMPOSER_SUBMIT: 'COMPOSER_SUBMIT',
  TODO_PATCH: 'TODO_PATCH',
  TODO_REMOVE: 'TODO_REMOVE',
})
