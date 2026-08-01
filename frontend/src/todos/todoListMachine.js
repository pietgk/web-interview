import { assign, fromPromise, setup } from 'xstate'
import {
  createTodo,
  isDematerializableTodo,
  removeTodoAt,
  updateTodoAt,
} from './todoModel'

/** Debounce window for autosave network writes (milliseconds). */
export const AUTOSAVE_DEBOUNCE_MS = 400

const emptyComposer = () => ({ text: '', linkedId: null })

const bumpDraft = (context, draft) => ({
  draft,
  draftRevision: context.draftRevision + 1,
  error: null,
})

const indexOfTodo = (draft, id) => draft.findIndex((todo) => todo.id === id)

const applyTodoPatch = (context, { id, index, patch }) => {
  const resolvedIndex =
    typeof id === 'string' ? indexOfTodo(context.draft, id) : index
  const current = context.draft[resolvedIndex]
  if (!current) return {}

  // Existing rows keep empty text (clear-then-type edits). Dematerialize only
  // through the linked composer path in changeComposer.
  return bumpDraft(context, updateTodoAt(context.draft, resolvedIndex, patch))
}

const changeComposer = (context, text) => {
  const value = text ?? ''
  const { linkedId } = context.composer

  if (linkedId) {
    const index = indexOfTodo(context.draft, linkedId)
    if (index === -1) {
      return { composer: { text: value, linkedId: null } }
    }

    const nextTodo = { ...context.draft[index], text: value }
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

  return { composer: { text: value, linkedId: null } }
}

/**
 * Per-list persistence + draft editor actor.
 *
 * Persistence states: clean → dirty → saving → clean | error
 * Composer stays local until the first non-whitespace character, then links
 * to one draft todo for the rest of the typing session.
 */
export const todoListMachine = setup({
  types: {
    context: {},
    events: {},
    input: {},
  },
  actors: {
    saveList: fromPromise(async () => {
      throw new Error('saveList actor must be provided')
    }),
  },
  guards: {
    composerDirties: ({ context, event }) =>
      Boolean(context.composer.linkedId) ||
      String(event.text ?? '').trim().length > 0,
    hasNewerDraft: ({ context, event }) =>
      context.draftRevision > event.output.revision,
    isStaleAck: ({ context, event }) => event.output.revision < context.ackRevision,
  },
  actions: {
    applyComposerChange: assign(({ context, event }) =>
      changeComposer(context, event.text)
    ),
    commitComposer: assign({
      composer: emptyComposer(),
    }),
    applyPatch: assign(({ context, event }) => applyTodoPatch(context, event)),
    removeTodo: assign(({ context, event }) => {
      const index =
        typeof event.id === 'string'
          ? indexOfTodo(context.draft, event.id)
          : event.index
      if (index < 0) return {}
      const removed = context.draft[index]
      const next = bumpDraft(context, removeTodoAt(context.draft, index))
      if (removed && context.composer.linkedId === removed.id) {
        return { ...next, composer: emptyComposer() }
      }
      return next
    }),
    clearError: assign({ error: null }),
    assignSaveError: assign({
      error: ({ event }) => event.error?.message || 'Failed to save',
    }),
    acknowledgeSave: assign(({ context, event }) => {
      if (event.output.revision < context.ackRevision) {
        return {}
      }
      return {
        acknowledged: event.output.result.todos,
        ackRevision: event.output.revision,
        error: null,
      }
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
    acknowledged: input.todos ?? [],
    draftRevision: 0,
    ackRevision: 0,
    error: null,
    composer: emptyComposer(),
  }),
  initial: 'clean',
  on: {
    COMPOSER_COMMIT: { actions: 'commitComposer' },
  },
  states: {
    clean: {
      on: {
        COMPOSER_CHANGE: [
          {
            guard: 'composerDirties',
            target: 'dirty',
            actions: 'applyComposerChange',
          },
          { actions: 'applyComposerChange' },
        ],
        TODO_PATCH: { target: 'dirty', actions: 'applyPatch' },
        TODO_REMOVE: { target: 'dirty', actions: 'removeTodo' },
      },
    },
    dirty: {
      after: {
        AUTOSAVE_DEBOUNCE_MS: { target: 'saving' },
      },
      on: {
        COMPOSER_CHANGE: [
          {
            guard: 'composerDirties',
            target: 'dirty',
            reenter: true,
            actions: 'applyComposerChange',
          },
          { actions: 'applyComposerChange' },
        ],
        TODO_PATCH: {
          target: 'dirty',
          reenter: true,
          actions: 'applyPatch',
        },
        TODO_REMOVE: {
          target: 'dirty',
          reenter: true,
          actions: 'removeTodo',
        },
        FLUSH: { target: 'saving' },
        RETRY: { target: 'saving' },
      },
    },
    saving: {
      entry: 'clearError',
      invoke: {
        src: 'saveList',
        input: ({ context }) => ({
          id: context.id,
          todos: context.draft,
          revision: context.draftRevision,
        }),
        onDone: [
          {
            guard: ({ context, event }) =>
              event.output.revision < context.ackRevision &&
              context.draftRevision > context.ackRevision,
            target: 'dirty',
          },
          {
            guard: 'isStaleAck',
            target: 'clean',
          },
          {
            guard: 'hasNewerDraft',
            target: 'saving',
            reenter: true,
            actions: 'acknowledgeSave',
          },
          {
            target: 'clean',
            actions: 'acknowledgeSave',
          },
        ],
        onError: {
          target: 'error',
          actions: 'assignSaveError',
        },
      },
      on: {
        COMPOSER_CHANGE: { actions: 'applyComposerChange' },
        TODO_PATCH: { actions: 'applyPatch' },
        TODO_REMOVE: { actions: 'removeTodo' },
      },
    },
    error: {
      on: {
        COMPOSER_CHANGE: [
          {
            guard: 'composerDirties',
            target: 'dirty',
            actions: 'applyComposerChange',
          },
          { actions: 'applyComposerChange' },
        ],
        TODO_PATCH: { target: 'dirty', actions: 'applyPatch' },
        TODO_REMOVE: { target: 'dirty', actions: 'removeTodo' },
        FLUSH: { target: 'saving' },
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
  const linkedId = context.composer?.linkedId
  if (!linkedId) return context.draft
  return context.draft.filter((todo) => todo.id !== linkedId)
}
