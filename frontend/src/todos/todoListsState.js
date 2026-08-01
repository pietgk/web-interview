import { isListCompleted } from './todoModel'

export const SAVE_STATUS = {
  CLEAN: 'clean',
  DIRTY: 'dirty',
  SAVING: 'saving',
  ERROR: 'error',
}

export const createListEntry = (list) => ({
  id: list.id,
  title: list.title,
  draft: list.todos,
  acknowledged: list.todos,
  draftRevision: 0,
  ackRevision: 0,
  status: SAVE_STATUS.CLEAN,
  error: null,
})

export const createInitialState = () => ({
  lists: {},
  activeListId: null,
  loadState: 'loading',
  loadError: null,
})

export const todoListsReducer = (state, action) => {
  switch (action.type) {
    case 'LOAD_START':
      return {
        ...state,
        loadState: 'loading',
        loadError: null,
      }

    case 'LOAD_SUCCESS': {
      const lists = {}
      for (const list of Object.values(action.lists)) {
        lists[list.id] = createListEntry(list)
      }
      return {
        ...state,
        lists,
        loadState: 'ready',
        loadError: null,
      }
    }

    case 'LOAD_ERROR':
      return {
        ...state,
        loadState: 'error',
        loadError: action.error,
      }

    case 'SET_ACTIVE_LIST':
      return {
        ...state,
        activeListId: action.id,
      }

    case 'EDIT_DRAFT': {
      const entry = state.lists[action.id]
      if (!entry) return state
      return {
        ...state,
        lists: {
          ...state.lists,
          [action.id]: {
            ...entry,
            draft: action.todos,
            draftRevision: entry.draftRevision + 1,
            status: SAVE_STATUS.DIRTY,
            error: null,
          },
        },
      }
    }

    case 'SAVE_START': {
      const entry = state.lists[action.id]
      if (!entry) return state
      return {
        ...state,
        lists: {
          ...state.lists,
          [action.id]: {
            ...entry,
            status: SAVE_STATUS.SAVING,
            error: null,
          },
        },
      }
    }

    case 'SAVE_SUCCESS': {
      const entry = state.lists[action.id]
      if (!entry) return state
      // Never let a stale acknowledgement overwrite a newer draft.
      if (action.revision < entry.ackRevision) {
        return state
      }

      const nextAckRevision = action.revision
      const stillDirty = entry.draftRevision > nextAckRevision
      return {
        ...state,
        lists: {
          ...state.lists,
          [action.id]: {
            ...entry,
            acknowledged: action.todos,
            ackRevision: nextAckRevision,
            status: stillDirty ? SAVE_STATUS.DIRTY : SAVE_STATUS.CLEAN,
            error: null,
          },
        },
      }
    }

    case 'SAVE_ERROR': {
      const entry = state.lists[action.id]
      if (!entry) return state
      return {
        ...state,
        lists: {
          ...state.lists,
          [action.id]: {
            ...entry,
            status: SAVE_STATUS.ERROR,
            error: action.error,
          },
        },
      }
    }

    default:
      return state
  }
}

export const selectVisibleLists = (state) =>
  Object.values(state.lists).map((entry) => ({
    id: entry.id,
    title: entry.title,
    todos: entry.draft,
    completed: isListCompleted(entry.draft),
    status: entry.status,
    error: entry.error,
  }))

export const selectActiveEntry = (state) =>
  state.activeListId ? state.lists[state.activeListId] ?? null : null

export const hasUnackedChanges = (state) =>
  Object.values(state.lists).some(
    (entry) =>
      entry.status === SAVE_STATUS.DIRTY ||
      entry.status === SAVE_STATUS.SAVING ||
      entry.status === SAVE_STATUS.ERROR ||
      entry.draftRevision > entry.ackRevision
  )
