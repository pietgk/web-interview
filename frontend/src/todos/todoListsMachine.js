import { assign, enqueueActions, fromPromise, sendTo, setup } from 'xstate'
import { createTodoListMachine, todoListMachine } from './todoListMachine'
import { isListCompleted } from './todoModel'

const listActorId = (id) => `list-${id}`

/**
 * Root catalog actor: loads lists, spawns a todoListMachine per list,
 * and coordinates active selection + flush-on-switch.
 */
export const todoListsMachine = setup({
  actors: {
    loadLists: fromPromise(async () => {
      throw new Error('loadLists actor must be provided')
    }),
    todoList: todoListMachine,
  },
  actions: {
    assignLoadError: assign({
      loadError: ({ event }) => event.error?.message || 'Failed to load todo lists',
    }),
    clearLoadError: assign({ loadError: null }),
    resetLists: assign({
      listIds: [],
      listRefs: {},
      titles: {},
      activeListId: null,
    }),
    stopListActors: enqueueActions(({ context, enqueue }) => {
      for (const id of context.listIds) {
        enqueue.stopChild(listActorId(id))
      }
    }),
    spawnLists: assign(({ event, spawn }) => {
      const lists = event.output
      const listIds = []
      const listRefs = {}
      const titles = {}

      for (const list of Object.values(lists)) {
        listIds.push(list.id)
        titles[list.id] = list.title
        listRefs[list.id] = spawn('todoList', {
          id: listActorId(list.id),
          input: {
            id: list.id,
            title: list.title,
            todos: list.todos,
          },
        })
      }

      return {
        listIds,
        listRefs,
        titles,
        loadError: null,
        activeListId: null,
      }
    }),
    flushPrevious: enqueueActions(({ context, enqueue }) => {
      const ref = context.listRefs[context.activeListId]
      if (!ref) return
      enqueue.sendTo(ref, { type: 'COMPOSER_COMMIT' })
      enqueue.sendTo(ref, { type: 'FLUSH' })
    }),
    setActiveList: assign({
      activeListId: ({ event }) => event.id,
    }),
    flushAllLists: enqueueActions(({ context, enqueue }) => {
      for (const id of context.listIds) {
        const ref = context.listRefs[id]
        if (!ref) continue
        enqueue.sendTo(ref, { type: 'COMPOSER_COMMIT' })
        enqueue.sendTo(ref, { type: 'FLUSH' })
      }
    }),
    forwardToActive: sendTo(
      ({ context }) => context.listRefs[context.activeListId],
      ({ event }) => event.event
    ),
    flushActive: enqueueActions(({ context, enqueue }) => {
      const ref = context.listRefs[context.activeListId]
      if (!ref) return
      enqueue.sendTo(ref, { type: 'COMPOSER_COMMIT' })
      enqueue.sendTo(ref, { type: 'FLUSH' })
    }),
    retryActive: sendTo(
      ({ context }) => context.listRefs[context.activeListId],
      { type: 'RETRY' }
    ),
  },
  guards: {
    hasActiveList: ({ context }) => Boolean(context.activeListId),
    hasPreviousDifferentList: ({ context, event }) =>
      Boolean(context.activeListId && context.activeListId !== event.id),
  },
}).createMachine({
  id: 'todoLists',
  context: {
    listIds: [],
    listRefs: {},
    titles: {},
    activeListId: null,
    loadError: null,
  },
  initial: 'loading',
  states: {
    loading: {
      entry: ['stopListActors', 'resetLists', 'clearLoadError'],
      invoke: {
        src: 'loadLists',
        onDone: {
          target: 'ready',
          actions: 'spawnLists',
        },
        onError: {
          target: 'error',
          actions: 'assignLoadError',
        },
      },
    },
    ready: {
      on: {
        SELECT_LIST: [
          {
            guard: 'hasPreviousDifferentList',
            actions: ['flushPrevious', 'setActiveList'],
          },
          { actions: 'setActiveList' },
        ],
        FLUSH_ALL: {
          actions: 'flushAllLists',
        },
        FLUSH_ACTIVE: {
          guard: 'hasActiveList',
          actions: 'flushActive',
        },
        RETRY_SAVE: {
          guard: 'hasActiveList',
          actions: 'retryActive',
        },
        FORWARD: {
          guard: 'hasActiveList',
          actions: 'forwardToActive',
        },
        RELOAD: {
          target: 'loading',
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

export const createTodoListsMachine = ({ fetchTodoLists, saveTodoList }) => {
  const listMachine = createTodoListMachine({ saveTodoList })

  return todoListsMachine.provide({
    actors: {
      loadLists: fromPromise(async () => fetchTodoLists()),
      todoList: listMachine,
    },
  })
}

export const selectVisibleLists = (snapshot) => {
  const { listIds, listRefs, titles } = snapshot.context
  return listIds.map((id) => {
    const childSnap = listRefs[id]?.getSnapshot()
    const draft = childSnap?.context?.draft ?? []
    return {
      id,
      title: titles[id] ?? childSnap?.context?.title ?? id,
      todos: draft,
      completed: isListCompleted(draft),
      status: childSnap?.value ?? 'clean',
      error: childSnap?.context?.error ?? null,
    }
  })
}

export const selectActiveListSnapshot = (snapshot) => {
  const { activeListId, listRefs } = snapshot.context
  if (!activeListId) return null
  return listRefs[activeListId]?.getSnapshot() ?? null
}

export const selectSaveChrome = (listSnapshot) => {
  if (!listSnapshot) {
    return { message: null, tone: 'secondary', showRetry: false, saveError: null }
  }

  const status = listSnapshot.value
  const saveError = listSnapshot.context.error

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

export const hasUnackedChanges = (snapshot) => {
  const { listIds, listRefs } = snapshot.context
  return listIds.some((id) => {
    const child = listRefs[id]?.getSnapshot()
    if (!child) return false
    const { draftRevision, ackRevision } = child.context
    return (
      child.value === 'dirty' ||
      child.value === 'saving' ||
      child.value === 'error' ||
      draftRevision > ackRevision
    )
  })
}
