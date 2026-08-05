import { useState } from 'react'
import { isDematerializableTodo } from './todoModel'
import { useSettledText } from './useSettledText'

/** @typedef {import('@web-interview/todos/types').Todo} Todo */
/** @typedef {import('@web-interview/todos/types').TodoList} TodoList */
/** @typedef {import('./todoListCommands').TodoListCommands} TodoListCommands */

/**
 * The "Add a todo" field, for the one Todo List currently on screen.
 *
 * It lives inside `TodoListForm`, which is keyed by list id, so exactly one of
 * these exists at a time. That is what lets it hold a single draft and a single
 * timer rather than a Record and a Map keyed by list, which is what this
 * replaced.
 *
 * Timing is delegated whole to `useSettledText` - the same 500ms idle / blur /
 * Enter / unmount rule that every other text field in the product runs. Passing
 * a constant `''` as the settled value is deliberate: the composer is a buffer
 * for a Todo that may not exist yet, not a view of one that does, so it never
 * adopts a value from the read model. `reset()` therefore empties the field,
 * which is what committing a row wants.
 *
 * On top of that this hook adds only the ghost rule (ADR 007):
 *
 * - no linked Todo, blank settle: nothing is written, because `text` is a
 *   Todo's defining attribute and a blank one is unrepresentable
 * - no linked Todo, non-blank settle: the Todo is created and linked
 * - linked Todo, non-blank settle: the Todo is retitled
 * - linked Todo, blank settle: the Todo is deleted
 *
 * A linked Todo that has been deleted elsewhere counts as "no linked Todo", so
 * the text in the field always becomes a Todo rather than being stranded.
 *
 * @param {TodoList} todoList the live Todo List, straight from the read model
 * @param {TodoListCommands} commands
 */
export const useGhostComposer = (todoList, commands) => {
  const [linkedId, setLinkedId] = useState(/** @type {string | null} */ (null))

  const { text, change, settle, reset } = useSettledText('', (next) => {
    const linked = linkedId
      ? todoList.todos.find((todo) => todo.id === linkedId) ?? null
      : null
    const blank = isDematerializableTodo({ text: next })

    if (!linked) {
      setLinkedId(blank ? null : commands.addTodo(todoList.id, next))
      return
    }
    if (blank) {
      commands.deleteTodo(linked)
      setLinkedId(null)
      return
    }
    commands.retitleTodo(linked, next)
  })

  return {
    text,
    change,

    /**
     * The Todo the field is currently standing in for is hidden from the list,
     * because the field is already showing it.
     */
    visibleTodos: todoList.todos.filter((todo) => todo.id !== linkedId),

    /** Enter, the Add button, or focus leaving the row: write it and start over. */
    commit: () => {
      settle()
      setLinkedId(null)
      reset()
    },
  }
}
