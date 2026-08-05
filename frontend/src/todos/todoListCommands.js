import { ATTRIBUTE } from '@web-interview/todos/datom'

/** @typedef {import('@web-interview/todos/types').Todo} Todo */
/** @typedef {import('@web-interview/todos/types').TodoList} TodoList */
/** @typedef {import('./useTodoLists').TodoClient} TodoClient */
/** @typedef {ReturnType<typeof createTodoListCommands>} TodoListCommands */

/**
 * The only module that knows datoms exist (ADR 007). Every export is named after
 * something a person did, so a component never spells out an attribute.
 *
 * Commands return nothing meaningful except `addTodo`, which returns the id it
 * minted because the ghost composer has to link to it. Everything else reaches
 * the UI through the read model, because the client applied the datom.
 *
 * A command may take a whole `Todo` rather than an id: a retraction carries the
 * value the client believed it was removing, so removing something needs to know
 * what was there.
 *
 * @param {TodoClient} client
 */
export const createTodoListCommands = (client) => ({
  /** An id for a Todo List that has no title, and therefore does not exist yet. */
  reserveListId: () => client.newListId(),

  /**
   * Also the command that brings a reserved Todo List into existence, because
   * `title` is a Todo List's defining attribute.
   *
   * @param {string} listId
   * @param {string} title
   */
  renameList: (listId, title) => {
    client.assert(listId, ATTRIBUTE.TITLE, title)
  },

  /**
   * One datom deletes a Todo List holding any number of Todos: they stop
   * projecting because the Todo List named by their ids no longer exists.
   *
   * @param {TodoList} todoList
   */
  deleteList: (todoList) => {
    client.retract(todoList.id, ATTRIBUTE.TITLE, todoList.title)
  },

  /**
   * @param {string} listId
   * @param {string} text
   * @returns {string | null} the new Todo's id, or null while editing is disabled
   */
  addTodo: (listId, text) => {
    const id = client.newTodoId(listId)
    return client.assert(id, ATTRIBUTE.TEXT, text) ? id : null
  },

  /** @param {Todo} todo @param {string} text */
  retitleTodo: (todo, text) => {
    client.assert(todo.id, ATTRIBUTE.TEXT, text)
  },

  /** @param {Todo} todo @param {boolean} completed */
  setTodoCompleted: (todo, completed) => {
    client.assert(todo.id, ATTRIBUTE.COMPLETED, completed)
  },

  /**
   * Clearing a due date retracts the value that was there, so a Todo whose date
   * is already absent writes nothing rather than an empty assertion.
   *
   * @param {Todo} todo
   * @param {string | null} dueDate
   */
  setTodoDueDate: (todo, dueDate) => {
    if (dueDate) client.assert(todo.id, ATTRIBUTE.DUE_DATE, dueDate)
    else if (todo.dueDate) client.retract(todo.id, ATTRIBUTE.DUE_DATE, todo.dueDate)
  },

  /**
   * `text` is a Todo's defining attribute, so retracting it deletes the Todo.
   *
   * @param {Todo} todo
   */
  deleteTodo: (todo) => {
    client.retract(todo.id, ATTRIBUTE.TEXT, todo.text)
  },
})
