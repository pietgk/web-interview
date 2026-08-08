import { useEffect, useRef, useSyncExternalStore } from 'react'
import { deleteLegacyReplica } from './legacyReplica'
import { createTodoClient } from './todoClient'

/** @typedef {ReturnType<typeof createTodoClient>} TodoClient */
/** @typedef {{client: TodoClient, readModel: import('@web-interview/todos/types').TodoLists, status: import('@web-interview/todos/types').TodoClientStatus, today: string | null}} TodoRuntime */

/** @param {{createClient?: () => TodoClient}} [options] */
export const useTodoLists = ({ createClient = createTodoClient } = {}) => {
  const clientRef = useRef(/** @type {TodoClient | null} */ (null))
  if (!clientRef.current) clientRef.current = createClient()
  const client = clientRef.current

  const readModel = useSyncExternalStore(
    client.subscribe,
    client.getReadModel,
    client.getReadModel
  )
  const status = useSyncExternalStore(
    client.subscribe,
    client.getStatus,
    client.getStatus
  )
  const today = useSyncExternalStore(
    client.subscribeToday,
    client.getToday,
    client.getToday
  )

  useEffect(() => {
    deleteLegacyReplica()
    client.start()
    return () => client.stop()
  }, [client])

  return { client, readModel, status, today }
}
