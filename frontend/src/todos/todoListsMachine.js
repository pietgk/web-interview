import { assign, cancel, enqueueActions, fromPromise, raise, setup } from 'xstate'
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

const autosaveId = (listId) => `autosave-${listId}`

const createListEntry = (list) => ({
  id: list.id,
  title: list.title,
  draft: list.todos ?? [],
  acknowledged: list.todos ?? [],
  draftRevision: 0,
  ackRevision: 0,
  status: 'clean',
  error: null,
  composer: emptyComposer(),
})

const indexOfTodo = (draft, id) => draft.findIndex((todo) => todo.id === id)

const bumpDraft = (entry, draft) => ({
  ...entry,
  draft,
  draftRevision: entry.draftRevision + 1,
  error: null,
})

const applyTodoPatch = (entry, { id, patch }) => {
  const resolvedIndex = indexOfTodo(entry.draft, id)
  const current = entry.draft[resolvedIndex]
  if (!current) return entry

  // Existing rows keep empty text (clear-then-type edits). Dematerialize only
  // through the linked composer path in changeComposer.
  return bumpDraft(entry, updateTodoAt(entry.draft, resolvedIndex, patch))
}

const changeComposer = (entry, text) => {
  const value = text ?? ''
  const { linkedId } = entry.composer

  if (linkedId) {
    const index = indexOfTodo(entry.draft, linkedId)
    if (index === -1) {
      return { ...entry, composer: { text: value, linkedId: null } }
    }

    const nextTodo = { ...entry.draft[index], text: value }
    if (isDematerializableTodo(nextTodo)) {
      return {
        ...bumpDraft(entry, removeTodoAt(entry.draft, index)),
        composer: emptyComposer(),
      }
    }

    return {
      ...bumpDraft(entry, updateTodoAt(entry.draft, index, { text: value })),
      composer: { text: value, linkedId },
    }
  }

  if (String(value).trim().length > 0) {
    const todo = createTodo({ text: value })
    return {
      ...bumpDraft(entry, [todo, ...entry.draft]),
      composer: { text: value, linkedId: todo.id },
    }
  }

  return { ...entry, composer: { text: value, linkedId: null } }
}

const removeTodoFromEntry = (entry, id) => {
  const index = indexOfTodo(entry.draft, id)
  if (index < 0) return entry
  const removed = entry.draft[index]
  const next = bumpDraft(entry, removeTodoAt(entry.draft, index))
  if (removed && entry.composer.linkedId === removed.id) {
    return { ...next, composer: emptyComposer() }
  }
  return next
}

const composerDirtiesEntry = (entry, text) =>
  Boolean(entry.composer.linkedId) || String(text ?? '').trim().length > 0

const withList = (context, listId, updater) => {
  const current = context.lists[listId]
  if (!current) return {}
  const next = updater(current)
  if (next === current) return {}
  return {
    lists: {
      ...context.lists,
      [listId]: next,
    },
  }
}

const enqueueAutosave = (enqueue, listId) => {
  enqueue(cancel(autosaveId(listId)))
  enqueue(
    raise(
      { type: 'SAVE_DUE', listId },
      { id: autosaveId(listId), delay: AUTOSAVE_DEBOUNCE_MS }
    )
  )
}

const markDirtyStatus = (entry) => {
  if (entry.status === 'saving') return entry
  return { ...entry, status: 'dirty', error: null }
}

const queueListSave = (context, listId) => {
  const entry = context.lists[listId]
  if (!entry) return {}
  if (entry.draftRevision <= entry.ackRevision && entry.status === 'clean') {
    return {}
  }
  if (context.saveQueue.includes(listId)) return {}
  return { saveQueue: [...context.saveQueue, listId] }
}

/**
 * Single catalog + editor actor.
 *
 * Top-level load states: loading → ready | error
 * Per-list persistence lives in context (`status`: clean | dirty | saving | error).
 * Debounced saves use a cancelable delayed SAVE_DUE event; writes run through a
 * small queue under ready.watching | ready.saving.
 */
export const todoListsMachine = setup({
  actors: {
    loadLists: fromPromise(async () => {
      throw new Error('loadLists actor must be provided')
    }),
    saveList: fromPromise(async () => {
      throw new Error('saveList actor must be provided')
    }),
  },
  guards: {
    hasActiveList: ({ context }) => Boolean(context.activeListId),
    hasPreviousDifferentList: ({ context, event }) =>
      Boolean(context.activeListId && context.activeListId !== event.id),
    hasSaveQueue: ({ context }) => context.saveQueue.length > 0,
    canRetryActive: ({ context }) => {
      const entry = context.lists[context.activeListId]
      return Boolean(entry && entry.status === 'error')
    },
    composerDirties: ({ context, event }) => {
      const entry = context.lists[context.activeListId]
      return Boolean(entry && composerDirtiesEntry(entry, event.text))
    },
    saveHasNewerDraft: ({ context, event }) => {
      const entry = context.lists[event.output.listId]
      return Boolean(entry && entry.draftRevision > event.output.revision)
    },
    saveIsStaleAck: ({ context, event }) => {
      const entry = context.lists[event.output.listId]
      return Boolean(entry && event.output.revision < entry.ackRevision)
    },
  },
  actions: {
    assignLoadError: assign({
      loadError: ({ event }) => event.error?.message || 'Failed to load todo lists',
    }),
    clearLoadError: assign({ loadError: null }),
    resetCatalog: assign({
      listIds: [],
      lists: {},
      activeListId: null,
      saveQueue: [],
      saveInput: null,
    }),
    hydrateLists: assign(({ event }) => {
      const listsPayload = event.output
      const listIds = []
      const lists = {}
      for (const list of Object.values(listsPayload)) {
        listIds.push(list.id)
        lists[list.id] = createListEntry(list)
      }
      return {
        listIds,
        lists,
        loadError: null,
        activeListId: null,
        saveQueue: [],
        saveInput: null,
      }
    }),
    setActiveList: assign({
      activeListId: ({ event }) => event.id,
    }),
    applyComposerChange: assign(({ context, event }) => {
      const listId = context.activeListId
      if (!listId) return {}
      return withList(context, listId, (entry) => {
        const next = changeComposer(entry, event.text)
        if (!composerDirtiesEntry(entry, event.text) && next.draftRevision === entry.draftRevision) {
          return next
        }
        return markDirtyStatus(next)
      })
    }),
    scheduleActiveAutosave: enqueueActions(({ context, enqueue }) => {
      const listId = context.activeListId
      if (!listId) return
      const entry = context.lists[listId]
      if (!entry || entry.status === 'saving') return
      enqueueAutosave(enqueue, listId)
    }),
    commitActiveComposer: assign(({ context }) => {
      const listId = context.activeListId
      if (!listId) return {}
      return withList(context, listId, (entry) => ({
        ...entry,
        composer: emptyComposer(),
      }))
    }),
    commitComposerForPrevious: assign(({ context }) => {
      const listId = context.activeListId
      if (!listId) return {}
      return withList(context, listId, (entry) => ({
        ...entry,
        composer: emptyComposer(),
      }))
    }),
    applyPatch: assign(({ context, event }) => {
      const listId = context.activeListId
      if (!listId) return {}
      return withList(context, listId, (entry) =>
        markDirtyStatus(applyTodoPatch(entry, event))
      )
    }),
    removeTodo: assign(({ context, event }) => {
      const listId = context.activeListId
      if (!listId) return {}
      return withList(context, listId, (entry) =>
        markDirtyStatus(removeTodoFromEntry(entry, event.id))
      )
    }),
    cancelActiveAutosave: enqueueActions(({ context, enqueue }) => {
      if (context.activeListId) enqueue(cancel(autosaveId(context.activeListId)))
    }),
    cancelAllAutosaves: enqueueActions(({ context, enqueue }) => {
      for (const listId of context.listIds) {
        enqueue(cancel(autosaveId(listId)))
      }
    }),
    queueSaveDue: assign(({ context, event }) => queueListSave(context, event.listId)),
    queueActiveSave: assign(({ context }) => queueListSave(context, context.activeListId)),
    queueAllDirtySaves: assign(({ context }) => {
      let saveQueue = [...context.saveQueue]
      const lists = { ...context.lists }
      for (const listId of context.listIds) {
        const entry = lists[listId]
        if (!entry) continue
        const needsSave =
          entry.status === 'dirty' ||
          entry.status === 'error' ||
          entry.draftRevision > entry.ackRevision
        if (!needsSave) continue
        if (!saveQueue.includes(listId)) saveQueue = [...saveQueue, listId]
      }
      return { saveQueue, lists }
    }),
    queuePreviousSave: assign(({ context }) => queueListSave(context, context.activeListId)),
    queueActiveRetry: assign(({ context }) => {
      const listId = context.activeListId
      if (!listId) return {}
      const entry = context.lists[listId]
      if (!entry) return {}
      const lists = {
        ...context.lists,
        [listId]: { ...entry, error: null },
      }
      return {
        lists,
        ...queueListSave({ ...context, lists }, listId),
      }
    }),
    prepareSaveInput: assign(({ context }) => {
      const listId = context.saveQueue[0]
      const entry = context.lists[listId]
      if (!entry) {
        return { saveInput: null, saveQueue: context.saveQueue.slice(1) }
      }
      return {
        saveInput: {
          listId,
          id: entry.id,
          todos: entry.draft,
          revision: entry.draftRevision,
        },
        lists: {
          ...context.lists,
          [listId]: { ...entry, status: 'saving', error: null },
        },
      }
    }),
    acknowledgeSave: assign(({ context, event }) => {
      const { listId, result, revision } = event.output
      const entry = context.lists[listId]
      if (!entry) return {}
      if (revision < entry.ackRevision) return {}

      const hasNewer = entry.draftRevision > revision
      return {
        lists: {
          ...context.lists,
          [listId]: {
            ...entry,
            acknowledged: result.todos,
            ackRevision: revision,
            error: null,
            status: hasNewer ? 'saving' : 'clean',
          },
        },
      }
    }),
    failSave: assign(({ context, event }) => {
      const listId = context.saveInput?.listId
      if (!listId) return {}
      const entry = context.lists[listId]
      if (!entry) return {}
      return {
        lists: {
          ...context.lists,
          [listId]: {
            ...entry,
            status: 'error',
            error: event.error?.message || 'Failed to save',
          },
        },
      }
    }),
    dequeueSave: assign(({ context }) => ({
      saveQueue: context.saveQueue.slice(1),
      saveInput: null,
    })),
    requeueNewerDraft: assign(({ context, event }) => {
      const listId = event.output.listId
      const entry = context.lists[listId]
      if (!entry || entry.draftRevision <= entry.ackRevision) return {}
      if (context.saveQueue.includes(listId)) return {}
      return { saveQueue: [...context.saveQueue, listId] }
    }),
  },
  delays: {
    AUTOSAVE_DEBOUNCE_MS,
  },
}).createMachine({
  id: 'todoLists',
  context: {
    listIds: [],
    lists: {},
    activeListId: null,
    loadError: null,
    saveQueue: [],
    saveInput: null,
  },
  initial: 'loading',
  states: {
    loading: {
      entry: ['resetCatalog', 'clearLoadError'],
      invoke: {
        src: 'loadLists',
        onDone: {
          target: 'ready',
          actions: 'hydrateLists',
        },
        onError: {
          target: 'error',
          actions: 'assignLoadError',
        },
      },
    },
    ready: {
      initial: 'watching',
      on: {
        COMPOSER_CHANGE: [
          {
            guard: 'composerDirties',
            actions: ['applyComposerChange', 'scheduleActiveAutosave'],
          },
          { actions: 'applyComposerChange' },
        ],
        COMPOSER_COMMIT: { actions: 'commitActiveComposer' },
        COMPOSER_SUBMIT: { actions: 'commitActiveComposer' },
        TODO_PATCH: {
          actions: ['applyPatch', 'scheduleActiveAutosave'],
        },
        TODO_REMOVE: {
          actions: ['removeTodo', 'scheduleActiveAutosave'],
        },
        RELOAD: { target: 'loading' },
      },
      states: {
        watching: {
          always: [{ guard: 'hasSaveQueue', target: 'saving' }],
          on: {
            SELECT_LIST: [
              {
                guard: 'hasPreviousDifferentList',
                actions: [
                  'commitComposerForPrevious',
                  'cancelActiveAutosave',
                  'queuePreviousSave',
                  'setActiveList',
                ],
              },
              { actions: 'setActiveList' },
            ],
            SAVE_DUE: { actions: 'queueSaveDue' },
            FLUSH_ACTIVE: {
              guard: 'hasActiveList',
              actions: [
                'commitActiveComposer',
                'cancelActiveAutosave',
                'queueActiveSave',
              ],
            },
            FLUSH_ALL: {
              actions: [
                'commitActiveComposer',
                'cancelAllAutosaves',
                'queueAllDirtySaves',
              ],
            },
            RETRY_SAVE: {
              guard: 'canRetryActive',
              actions: ['cancelActiveAutosave', 'queueActiveRetry'],
            },
          },
        },
        saving: {
          entry: 'prepareSaveInput',
          invoke: {
            src: 'saveList',
            input: ({ context }) => context.saveInput,
            onDone: [
              {
                guard: 'saveIsStaleAck',
                target: 'watching',
                actions: ['dequeueSave'],
              },
              {
                guard: 'saveHasNewerDraft',
                target: 'watching',
                actions: ['acknowledgeSave', 'dequeueSave', 'requeueNewerDraft'],
              },
              {
                target: 'watching',
                actions: ['acknowledgeSave', 'dequeueSave'],
              },
            ],
            onError: {
              target: 'watching',
              actions: ['failSave', 'dequeueSave'],
            },
          },
          on: {
            SELECT_LIST: [
              {
                guard: 'hasPreviousDifferentList',
                actions: [
                  'commitComposerForPrevious',
                  'cancelActiveAutosave',
                  'queuePreviousSave',
                  'setActiveList',
                ],
              },
              { actions: 'setActiveList' },
            ],
            SAVE_DUE: { actions: 'queueSaveDue' },
            FLUSH_ACTIVE: {
              guard: 'hasActiveList',
              actions: [
                'commitActiveComposer',
                'cancelActiveAutosave',
                'queueActiveSave',
              ],
            },
            FLUSH_ALL: {
              actions: [
                'commitActiveComposer',
                'cancelAllAutosaves',
                'queueAllDirtySaves',
              ],
            },
            RETRY_SAVE: {
              guard: 'canRetryActive',
              actions: ['cancelActiveAutosave', 'queueActiveRetry'],
            },
          },
        },
      },
    },
    error: {
      on: {
        RELOAD: { target: 'loading' },
      },
    },
  },
})

export const createTodoListsMachine = ({ fetchTodoLists, saveTodoList }) =>
  todoListsMachine.provide({
    actors: {
      loadLists: fromPromise(async () => fetchTodoLists()),
      saveList: fromPromise(async ({ input }) => {
        const result = await saveTodoList(input.id, { todos: input.todos })
        return { result, revision: input.revision, listId: input.listId }
      }),
    },
  })

/** Todos shown below the composer (excludes the in-progress linked draft). */
export const selectVisibleTodos = (entry) => {
  const draftId = entry?.composer?.linkedId
  if (!draftId) return entry?.draft ?? []
  return entry.draft.filter((todo) => todo.id !== draftId)
}

export const selectSaveChrome = (entry) => {
  if (!entry) {
    return { message: null, tone: 'secondary', showRetry: false, saveError: null }
  }

  const { status, error: saveError } = entry

  if (status === 'saving') {
    return { message: 'Saving…', tone: 'secondary', showRetry: false, saveError: null }
  }
  if (status === 'clean') {
    return {
      message: 'All changes saved',
      tone: 'secondary',
      showRetry: false,
      saveError: null,
    }
  }
  if (status === 'dirty') {
    return {
      message: 'Unsaved changes',
      tone: 'secondary',
      showRetry: false,
      saveError: null,
    }
  }
  if (status === 'error') {
    return {
      message: `Save failed: ${saveError}`,
      tone: 'error',
      showRetry: true,
      saveError,
    }
  }
  return { message: null, tone: 'secondary', showRetry: false, saveError: null }
}

export const selectViewModel = (snapshot) => {
  const loadState = snapshot.matches('loading')
    ? 'loading'
    : snapshot.matches('error')
      ? 'error'
      : 'ready'

  const { listIds, lists, activeListId, loadError } = snapshot.context

  const visibleLists = listIds.map((id) => {
    const entry = lists[id]
    const draft = entry?.draft ?? []
    return {
      id,
      title: entry?.title ?? id,
      todos: draft,
      completed: isListCompleted(draft),
      status: entry?.status ?? 'clean',
      error: entry?.error ?? null,
    }
  })

  const active = activeListId ? lists[activeListId] : null
  const activeEntry = active
    ? {
        id: active.id,
        title: active.title,
        draft: selectVisibleTodos(active),
        composerText: active.composer.text,
        status: active.status,
        error: active.error,
        saveChrome: selectSaveChrome(active),
      }
    : null

  return {
    loadState,
    loadError,
    lists: visibleLists,
    activeEntry,
    activeListId,
  }
}

export const hasUnackedChanges = (snapshot) => {
  const { listIds, lists } = snapshot.context
  return listIds.some((id) => {
    const entry = lists[id]
    if (!entry) return false
    return (
      entry.status === 'dirty' ||
      entry.status === 'saving' ||
      entry.status === 'error' ||
      entry.draftRevision > entry.ackRevision
    )
  })
}
