import { useCallback, useEffect, useState } from 'react'
import { useMachine } from '@xstate/react'
import {
  fetchTodoLists,
  saveTodoList as persistTodoList,
} from '../api/todoLists'
import { getInspect } from './inspect'
import { selectVisibleTodos } from './todoListMachine'
import {
  createTodoListsMachine,
  hasUnackedChanges,
  selectActiveListSnapshot,
  selectSaveChrome,
  selectVisibleLists,
} from './todoListsMachine'

const machine = createTodoListsMachine({
  fetchTodoLists,
  saveTodoList: persistTodoList,
})

export const useTodoLists = () => {
  const [snapshot, send, actorRef] = useMachine(machine, {
    inspect: getInspect(),
  })
  const [, setChildVersion] = useState(0)

  // Parent snapshots do not change when child drafts/status update — subscribe.
  useEffect(() => {
    const refs = Object.values(snapshot.context.listRefs)
    if (!refs.length) return undefined

    const subscriptions = refs.map((ref) =>
      ref.subscribe(() => {
        setChildVersion((version) => version + 1)
      })
    )

    return () => {
      for (const subscription of subscriptions) {
        subscription.unsubscribe()
      }
    }
  }, [snapshot.context.listRefs])

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!hasUnackedChanges(actorRef.getSnapshot())) return
      event.preventDefault()
      event.returnValue = ''
    }

    const onPageHide = () => {
      actorRef.send({ type: 'FLUSH_ALL' })
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [actorRef])

  const loadState =
    snapshot.value === 'loading'
      ? 'loading'
      : snapshot.value === 'error'
        ? 'error'
        : 'ready'

  const lists = selectVisibleLists(snapshot)
  const activeSnapshot = selectActiveListSnapshot(snapshot)
  const saveChrome = selectSaveChrome(activeSnapshot)

  const activeEntry = activeSnapshot
    ? {
        id: activeSnapshot.context.id,
        title: activeSnapshot.context.title,
        draft: selectVisibleTodos(activeSnapshot.context),
        composerText: activeSnapshot.context.composer.text,
        status: activeSnapshot.value,
        error: activeSnapshot.context.error,
        saveChrome,
      }
    : null

  const selectList = useCallback(
    (id) => {
      send({ type: 'SELECT_LIST', id })
    },
    [send]
  )

  const forward = useCallback(
    (event) => {
      send({ type: 'FORWARD', event })
    },
    [send]
  )

  const patchTodo = useCallback(
    (id, patch) => {
      forward({ type: 'TODO_PATCH', id, patch })
    },
    [forward]
  )

  const removeTodo = useCallback(
    (id) => {
      forward({ type: 'TODO_REMOVE', id })
    },
    [forward]
  )

  const changeComposer = useCallback(
    (text) => {
      forward({ type: 'COMPOSER_CHANGE', text })
    },
    [forward]
  )

  const commitComposer = useCallback(() => {
    forward({ type: 'COMPOSER_COMMIT' })
  }, [forward])

  const flushList = useCallback(() => {
    send({ type: 'FLUSH_ACTIVE' })
  }, [send])

  const retrySave = useCallback(() => {
    send({ type: 'RETRY_SAVE' })
  }, [send])

  const reload = useCallback(() => {
    send({ type: 'RELOAD' })
  }, [send])

  return {
    loadState,
    loadError: snapshot.context.loadError,
    lists,
    activeEntry,
    activeListId: snapshot.context.activeListId,
    selectList,
    patchTodo,
    removeTodo,
    changeComposer,
    commitComposer,
    flushList,
    retrySave,
    reload,
  }
}
