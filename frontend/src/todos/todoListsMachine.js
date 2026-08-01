import { assign, enqueueActions, fromPromise, setup } from 'xstate'
import {
  createTodoListMachine,
  hasUnackedChanges as listHasUnackedChanges,
  todoListMachine,
} from './todoListMachine'

const listActorId = (id) => `todo-list-${id}`

/** Catalog actor responsible only for loading, selection, and child coordination. */
export const todoListsMachine = setup({
  actors: {
    loadLists: fromPromise(async () => {
      throw new Error('loadLists actor must be provided')
    }),
    todoList: todoListMachine,
  },
  guards: {
    listExists: ({ context, event }) => Boolean(context.listRefs[event.id]),
    hasPreviousDifferentList: ({ context, event }) =>
      Boolean(
        context.listRefs[event.id] &&
          context.activeListId &&
          context.activeListId !== event.id
      ),
  },
  actions: {
    assignLoadError: assign({
      loadError: ({ event }) => event.error?.message || 'Failed to load todo lists',
    }),
    clearCatalog: assign({
      listIds: [],
      listRefs: {},
      activeListId: null,
      loadError: null,
    }),
    stopListActors: enqueueActions(({ context, enqueue }) => {
      for (const ref of Object.values(context.listRefs)) {
        enqueue.stopChild(ref)
      }
    }),
    spawnLists: assign(({ event, spawn }) => {
      const listIds = []
      const listRefs = {}

      for (const list of Object.values(event.output)) {
        listIds.push(list.id)
        listRefs[list.id] = spawn('todoList', {
          id: listActorId(list.id),
          input: list,
        })
      }

      return {
        listIds,
        listRefs,
        activeListId: null,
        loadError: null,
      }
    }),
    flushPrevious: enqueueActions(({ context, enqueue }) => {
      const ref = context.listRefs[context.activeListId]
      if (ref) enqueue.sendTo(ref, { type: 'FLUSH' })
    }),
    setActiveList: assign({ activeListId: ({ event }) => event.id }),
    flushAllLists: enqueueActions(({ context, enqueue }) => {
      for (const ref of Object.values(context.listRefs)) {
        enqueue.sendTo(ref, { type: 'FLUSH' })
      }
    }),
  },
}).createMachine({
  id: 'todoLists',
  context: {
    listIds: [],
    listRefs: {},
    activeListId: null,
    loadError: null,
  },
  initial: 'loading',
  states: {
    loading: {
      entry: ['stopListActors', 'clearCatalog'],
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
          { guard: 'listExists', actions: 'setActiveList' },
        ],
        FLUSH_ALL: { actions: 'flushAllLists' },
        RELOAD: { target: 'loading' },
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
      loadLists: fromPromise(({ signal }) => fetchTodoLists({ signal })),
      todoList: createTodoListMachine({ saveTodoList }),
    },
  })

export const selectCatalogView = (snapshot) => {
  const loadState = snapshot.matches('loading')
    ? 'loading'
    : snapshot.matches('error')
      ? 'error'
      : 'ready'
  const { listIds, listRefs, activeListId, loadError } = snapshot.context

  return {
    loadState,
    loadError,
    lists: listIds.map((id) => ({ id, actorRef: listRefs[id] })),
    activeListId,
    activeListRef: activeListId ? listRefs[activeListId] : null,
  }
}

export const hasUnackedChanges = (snapshot) =>
  snapshot.context.listIds.some((id) => {
    const childSnapshot = snapshot.context.listRefs[id]?.getSnapshot()
    return Boolean(childSnapshot && listHasUnackedChanges(childSnapshot))
  })
