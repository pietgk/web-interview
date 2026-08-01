import { assign, fromPromise, setup } from 'xstate'
import {
  createTodo,
  isDematerializableTodo,
  isListCompleted,
  removeTodoAt,
  updateTodoAt,
} from './todoModel'

/** Debounce window for autosave network writes (milliseconds). */
export const AUTOSAVE_DEBOUNCE_MS = 400

const emptyComposer = () => ({ text: '', linkedId: null })

const indexOfTodo = (draft, id) => draft.findIndex((todo) => todo.id === id)

const bumpDraft = (context, draft) => ({
  draft,
  revision: context.revision + 1,
  error: null,
})

const todoPatchChanges = (context, { id, patch }) => {
  const todo = context.draft[indexOfTodo(context.draft, id)]
  if (!todo || !patch) return false
  return Object.entries(patch).some(([key, value]) => !Object.is(todo[key], value))
}

const applyTodoPatch = (context, { id, patch }) => {
  const index = indexOfTodo(context.draft, id)
  if (index < 0 || !todoPatchChanges(context, { id, patch })) return {}
  return bumpDraft(context, updateTodoAt(context.draft, index, patch))
}

const composerChangesDraft = (context, text) => {
  const value = text ?? ''
  const { linkedId } = context.composer
  if (!linkedId) return String(value).trim().length > 0

  const todo = context.draft[indexOfTodo(context.draft, linkedId)]
  return Boolean(todo && todo.text !== value)
}

const changeComposer = (context, text) => {
  const value = text ?? ''
  const { linkedId } = context.composer

  if (linkedId) {
    const index = indexOfTodo(context.draft, linkedId)
    if (index === -1) {
      return { composer: { text: value, linkedId: null } }
    }

    const current = context.draft[index]
    if (current.text === value) return {}

    const nextTodo = { ...current, text: value }
    if (isDematerializableTodo(nextTodo)) {
      return {
        ...bumpDraft(context, removeTodoAt(context.draft, index)),
        composer: emptyComposer(),
      }
    }

    return {
      ...bumpDraft(context, updateTodoAt(context.draft, index, { text: value })),
      composer: { text: value, linkedId },
    }
  }

  if (String(value).trim().length > 0) {
    const todo = createTodo({ text: value })
    return {
      ...bumpDraft(context, [todo, ...context.draft]),
      composer: { text: value, linkedId: todo.id },
    }
  }

  if (context.composer.text === value) return {}
  return { composer: { text: value, linkedId: null } }
}

const removeTodo = (context, id) => {
  const index = indexOfTodo(context.draft, id)
  if (index < 0) return {}

  const removed = context.draft[index]
  const next = bumpDraft(context, removeTodoAt(context.draft, index))
  if (context.composer.linkedId === removed.id) {
    return { ...next, composer: emptyComposer() }
  }
  return next
}

const draftEvents = ({ reenter = false } = {}) => ({
  COMPOSER_CHANGE: [
    {
      guard: 'composerChangesDraft',
      target: 'dirty',
      reenter,
      actions: 'applyComposerChange',
    },
    { actions: 'applyComposerChange' },
  ],
  TODO_PATCH: {
    guard: 'todoPatchChanges',
    target: 'dirty',
    reenter,
    actions: 'applyPatch',
  },
  TODO_REMOVE: {
    guard: 'todoExists',
    target: 'dirty',
    reenter,
    actions: 'removeTodo',
  },
})

/** One independently editable and persistable todo list. */
export const todoListMachine = setup({
  actors: {
    saveList: fromPromise(async () => {
      throw new Error('saveList actor must be provided')
    }),
  },
  guards: {
    composerChangesDraft: ({ context, event }) =>
      composerChangesDraft(context, event.text),
    todoPatchChanges: ({ context, event }) => todoPatchChanges(context, event),
    todoExists: ({ context, event }) => indexOfTodo(context.draft, event.id) >= 0,
    hasNewerDraft: ({ context, event }) => context.revision > event.output.revision,
  },
  actions: {
    applyComposerChange: assign(({ context, event }) =>
      changeComposer(context, event.text)
    ),
    commitComposer: assign({ composer: emptyComposer }),
    applyPatch: assign(({ context, event }) => applyTodoPatch(context, event)),
    removeTodo: assign(({ context, event }) => removeTodo(context, event.id)),
    clearError: assign({ error: null }),
    assignSaveError: assign({
      error: ({ event }) => event.error?.message || 'Failed to save',
    }),
  },
  delays: {
    AUTOSAVE_DEBOUNCE_MS,
  },
}).createMachine({
  id: 'todoList',
  context: ({ input }) => ({
    id: input.id,
    title: input.title,
    draft: input.todos ?? [],
    composer: emptyComposer(),
    revision: 0,
    error: null,
  }),
  initial: 'clean',
  on: {
    COMPOSER_COMMIT: { actions: 'commitComposer' },
    COMPOSER_SUBMIT: { actions: 'commitComposer' },
  },
  states: {
    clean: {
      on: {
        ...draftEvents(),
        FLUSH: { actions: 'commitComposer' },
      },
    },
    dirty: {
      after: {
        AUTOSAVE_DEBOUNCE_MS: { target: 'saving' },
      },
      on: {
        ...draftEvents({ reenter: true }),
        FLUSH: { target: 'saving', actions: 'commitComposer' },
      },
    },
    saving: {
      entry: 'clearError',
      invoke: {
        src: 'saveList',
        input: ({ context }) => ({
          id: context.id,
          todos: context.draft,
          revision: context.revision,
        }),
        onDone: [
          {
            guard: 'hasNewerDraft',
            target: 'saving',
            reenter: true,
          },
          { target: 'clean' },
        ],
        onError: {
          target: 'error',
          actions: 'assignSaveError',
        },
      },
      on: {
        COMPOSER_CHANGE: { actions: 'applyComposerChange' },
        TODO_PATCH: { guard: 'todoPatchChanges', actions: 'applyPatch' },
        TODO_REMOVE: { guard: 'todoExists', actions: 'removeTodo' },
        FLUSH: { actions: 'commitComposer' },
      },
    },
    error: {
      on: {
        ...draftEvents(),
        FLUSH: { target: 'saving', actions: 'commitComposer' },
        RETRY: { target: 'saving' },
      },
    },
  },
})

export const createTodoListMachine = ({ saveTodoList }) =>
  todoListMachine.provide({
    actors: {
      saveList: fromPromise(async ({ input }) => {
        const result = await saveTodoList(input.id, { todos: input.todos })
        return { result, revision: input.revision }
      }),
    },
  })

/** Todos shown below the composer (excludes the in-progress linked draft). */
export const selectVisibleTodos = (context) => {
  const linkedId = context?.composer?.linkedId
  if (!linkedId) return context?.draft ?? []
  return context.draft.filter((todo) => todo.id !== linkedId)
}

export const selectSaveChrome = (snapshot) => {
  if (!snapshot) {
    return { message: null, tone: 'secondary', showRetry: false, saveError: null }
  }

  const saveError = snapshot.context.error
  if (snapshot.matches('saving')) {
    return { message: 'Saving…', tone: 'secondary', showRetry: false, saveError: null }
  }
  if (snapshot.matches('clean')) {
    return {
      message: 'All changes saved',
      tone: 'secondary',
      showRetry: false,
      saveError: null,
    }
  }
  if (snapshot.matches('dirty')) {
    return {
      message: 'Unsaved changes',
      tone: 'secondary',
      showRetry: false,
      saveError: null,
    }
  }
  if (snapshot.matches('error')) {
    return {
      message: `Save failed: ${saveError}`,
      tone: 'error',
      showRetry: true,
      saveError,
    }
  }
  return { message: null, tone: 'secondary', showRetry: false, saveError: null }
}

export const selectListSummary = (snapshot) => ({
  id: snapshot.context.id,
  title: snapshot.context.title,
  completed: isListCompleted(snapshot.context.draft),
  status: snapshot.value,
  error: snapshot.context.error,
})

export const selectTodoListView = (snapshot) => ({
  id: snapshot.context.id,
  title: snapshot.context.title,
  draft: selectVisibleTodos(snapshot.context),
  composerText: snapshot.context.composer.text,
  status: snapshot.value,
  error: snapshot.context.error,
  saveChrome: selectSaveChrome(snapshot),
})

export const hasUnackedChanges = (snapshot) => !snapshot.matches('clean')
