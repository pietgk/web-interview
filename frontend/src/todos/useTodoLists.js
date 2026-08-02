import { useEffect, useRef, useSyncExternalStore } from 'react'
import { createTodoListActor } from '@web-interview/todos/actor'
import { ACTOR_EVENT } from '@web-interview/todos/protocol'
import { hasLocallyUndurableChanges } from '@web-interview/todos/selectors'
import { createIndexedDbReplicaStorage } from './indexedDbReplicaStorage'
import { CLIENT_ID_STORAGE_KEY } from './persistenceConfig'

/** @typedef {import('@web-interview/todos/actor').TodoListActor} TodoListActor */
/** @typedef {import('@web-interview/todos/types').TodoStorage} TodoStorage */
/** @typedef {{actor: TodoListActor, clientId: string}} TodoRuntime */

const clientId = () => {
  try {
    const existing = localStorage.getItem(CLIENT_ID_STORAGE_KEY)
    if (existing) return existing
    const generated =
      globalThis.crypto?.randomUUID?.() ??
      `client-${Date.now()}-${Math.random().toString(16).slice(2)}`
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, generated)
    return generated
  } catch {
    return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}

/** @param {{createStorage?: () => TodoStorage}} [options] */
export const useTodoLists = ({ createStorage = createIndexedDbReplicaStorage } = {}) => {
  const runtime = useRef(/** @type {TodoRuntime | null} */ (null))
  let current = runtime.current
  if (!current) {
    current = {
      actor: createTodoListActor({ storage: createStorage() }),
      clientId: clientId(),
    }
    runtime.current = current
  }

  const { actor } = current
  const snapshot = useSyncExternalStore(
    (notify) => {
      const subscription = actor.subscribe(notify)
      return () => subscription.unsubscribe()
    },
    actor.getSnapshot,
    actor.getSnapshot
  )

  useEffect(() => {
    actor.start()

    /** @param {BeforeUnloadEvent} event */
    const onBeforeUnload = (event) => {
      if (!hasLocallyUndurableChanges(actor.getSnapshot())) return
      event.preventDefault()
      event.returnValue = ''
    }
    const onOnline = () => actor.send({ type: ACTOR_EVENT.ONLINE })
    const onOffline = () => actor.send({ type: ACTOR_EVENT.OFFLINE })

    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      actor.stop()
    }
  }, [actor])

  return {
    actor,
    clientId: current.clientId,
    snapshot,
  }
}
