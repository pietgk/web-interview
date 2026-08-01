import { useCallback, useEffect, useReducer, useRef } from 'react'
import {
  fetchTodoLists,
  saveTodoList as persistTodoList,
} from '../api/todoLists'
import { AUTOSAVE_DEBOUNCE_MS, createSaveQueue } from './createSaveQueue'
import {
  createInitialState,
  hasUnackedChanges,
  selectActiveEntry,
  selectVisibleLists,
  todoListsReducer,
} from './todoListsState'

export const useTodoLists = () => {
  const [state, dispatch] = useReducer(todoListsReducer, undefined, createInitialState)
  const stateRef = useRef(state)
  stateRef.current = state

  const queueRef = useRef(null)

  if (queueRef.current == null) {
    queueRef.current = createSaveQueue({
      debounceMs: AUTOSAVE_DEBOUNCE_MS,
      save: (id, todos) => persistTodoList(id, { todos }),
      onSaving: (id) => {
        dispatch({ type: 'SAVE_START', id })
      },
      onSuccess: (id, { revision, result }) => {
        dispatch({
          type: 'SAVE_SUCCESS',
          id,
          revision,
          todos: result.todos,
        })
      },
      onError: (id, { error }) => {
        dispatch({
          type: 'SAVE_ERROR',
          id,
          error: error.message || 'Failed to save',
        })
      },
    })
  }

  useEffect(() => {
    const queue = queueRef.current
    return () => {
      queue.dispose()
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    dispatch({ type: 'LOAD_START' })

    fetchTodoLists({ signal: controller.signal })
      .then((lists) => {
        if (controller.signal.aborted) return
        dispatch({ type: 'LOAD_SUCCESS', lists })
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        dispatch({
          type: 'LOAD_ERROR',
          error: error.message || 'Failed to load todo lists',
        })
      })

    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!hasUnackedChanges(stateRef.current)) return
      event.preventDefault()
      event.returnValue = ''
    }

    const onPageHide = () => {
      queueRef.current.flushAll()
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [])

  const updateTodos = useCallback((id, todos) => {
    const entry = stateRef.current.lists[id]
    if (!entry) return
    const revision = entry.draftRevision + 1
    dispatch({ type: 'EDIT_DRAFT', id, todos })
    queueRef.current.enqueue(id, todos, revision)
  }, [])

  const flushList = useCallback((id) => {
    if (!id) return
    queueRef.current.flush(id)
  }, [])

  const selectList = useCallback((id) => {
    const previousId = stateRef.current.activeListId
    if (previousId && previousId !== id) {
      queueRef.current.flush(previousId)
    }
    dispatch({ type: 'SET_ACTIVE_LIST', id })
  }, [])

  const retrySave = useCallback((id) => {
    const entry = stateRef.current.lists[id]
    if (!entry) return
    queueRef.current.retry(id, entry.draft, entry.draftRevision)
  }, [])

  const reload = useCallback(() => {
    dispatch({ type: 'LOAD_START' })
    fetchTodoLists()
      .then((lists) => {
        dispatch({ type: 'LOAD_SUCCESS', lists })
      })
      .catch((error) => {
        dispatch({
          type: 'LOAD_ERROR',
          error: error.message || 'Failed to load todo lists',
        })
      })
  }, [])

  return {
    loadState: state.loadState,
    loadError: state.loadError,
    lists: selectVisibleLists(state),
    activeEntry: selectActiveEntry(state),
    activeListId: state.activeListId,
    selectList,
    updateTodos,
    flushList,
    retrySave,
    reload,
  }
}
