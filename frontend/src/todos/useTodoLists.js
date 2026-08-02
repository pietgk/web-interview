import { useEffect, useRef, useSyncExternalStore } from 'react'
import {
  createTodoListActor,
  hasLocallyUndurableChanges,
} from '@web-interview/todo-contract'
import { createIndexedDbReplicaStorage } from './indexedDbReplicaStorage'

const clientId = () => {
  const key = 'web-interview-todo-client-id'
  try {
    const existing = localStorage.getItem(key)
    if (existing) return existing
    const generated =
      globalThis.crypto?.randomUUID?.() ??
      `client-${Date.now()}-${Math.random().toString(16).slice(2)}`
    localStorage.setItem(key, generated)
    return generated
  } catch {
    return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}

export const useTodoLists = ({ createStorage = createIndexedDbReplicaStorage } = {}) => {
  const runtime = useRef(null)
  if (!runtime.current) {
    runtime.current = {
      actor: createTodoListActor({ storage: createStorage() }),
      clientId: clientId(),
    }
  }

  const { actor } = runtime.current
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

    const onBeforeUnload = (event) => {
      if (!hasLocallyUndurableChanges(actor.getSnapshot())) return
      event.preventDefault()
      event.returnValue = ''
    }
    const onOnline = () => actor.send({ type: 'ONLINE' })
    const onOffline = () => actor.send({ type: 'OFFLINE' })

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
    clientId: runtime.current.clientId,
    snapshot,
  }
}
