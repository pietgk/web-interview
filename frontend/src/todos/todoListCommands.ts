import { ATTRIBUTE } from '@web-interview/todos/datom'
import type { Todo, TodoList } from '@web-interview/todos/types'
import type { TodoClient } from './useTodoLists.ts'

export type TodoListCommands = ReturnType<typeof createTodoListCommands>

/**
 * The only module that knows datoms exist (ADR 007). Every export is an imperative
 * command — what should be done to domain facts — so a component never spells out
 * an attribute.
 * Commands return nothing meaningful except `addTodo`, which returns the id it
 * minted because the ghost composer has to link to it. Everything else reaches
 * the UI through the read model, because the client applied the datom.
 * A command may take a whole `Todo` rather than an id: a retraction carries the
 * value the client believed it was removing, so removing something needs to know
 * what was there.
 */
export const createTodoListCommands = (client: TodoClient) => ({
  /** An id for a Todo List that has no title, and therefore does not exist yet. */
  reserveListId: () => client.newListId(),

  /**
   * Brings a reserved Todo List into existence. Materialization is separate
   * from rename so only the explicit creation path may assert a missing title.
   */
  materializeList: (listId: string, title: string) => {
    client.assert(listId, ATTRIBUTE.TITLE, title)
  },

  renameList: (listId: string, title: string) => {
    if (!client.getReadModel()[listId]) return
    client.assert(listId, ATTRIBUTE.TITLE, title)
  },

  /**
   * One datom deletes a Todo List holding any number of Todos: they stop
   * projecting because the Todo List named by their ids no longer exists.
   */
  deleteList: (todoList: TodoList) => {
    client.retract(todoList.id, ATTRIBUTE.TITLE, todoList.title)
  },

  /** The new Todo's id, or null while editing is disabled. */
  addTodo: (listId: string, text: string): string | null => {
    const id = client.newTodoId(listId)
    return client.assert(id, ATTRIBUTE.TEXT, text) ? id : null
  },

  retitleTodo: (todo: Todo, text: string) => {
    const todoStillExists = Object.values(client.getReadModel()).some(
      (todoList) => todoList.todos.some((candidate) => candidate.id === todo.id)
    )
    if (!todoStillExists) return
    client.assert(todo.id, ATTRIBUTE.TEXT, text)
  },

  setTodoCompleted: (todo: Todo, completed: boolean) => {
    client.assert(todo.id, ATTRIBUTE.COMPLETED, completed)
  },

  /**
   * Clearing a due date retracts the value that was there, so a Todo whose date
   * is already absent writes nothing rather than an empty assertion.
   */
  setTodoDueDate: (todo: Todo, dueDate: string | null) => {
    if (dueDate) client.assert(todo.id, ATTRIBUTE.DUE_DATE, dueDate)
    else if (todo.dueDate) client.retract(todo.id, ATTRIBUTE.DUE_DATE, todo.dueDate)
  },

  /**
   * `text` is a Todo's defining attribute, so retracting it deletes the Todo.
   */
  deleteTodo: (todo: Todo) => {
    client.retract(todo.id, ATTRIBUTE.TEXT, todo.text)
  },
})
