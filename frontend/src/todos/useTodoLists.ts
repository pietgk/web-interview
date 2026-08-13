import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { TodoClientStatus, TodoLists } from '@web-interview/todos/types'
import { deleteLegacyReplica } from './legacyReplica.ts'
import { createTodoClient } from './todoClient.ts'

export type TodoClient = ReturnType<typeof createTodoClient>
export type TodoRuntime = {
  client: TodoClient
  readModel: TodoLists
  status: TodoClientStatus
  today: string | null
}

export const useTodoLists = ({ createClient = createTodoClient }: {createClient?: () => TodoClient} = {}) => {
  const clientRef = useRef<TodoClient | null>(null)
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
