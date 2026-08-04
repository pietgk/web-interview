import React from 'react'
import { createFakeDatomServer } from './fakeDatomServer'
import { createTodoClient } from '../todos/todoClient'
import { useTodoLists } from '../todos/useTodoLists'
import { StatusBar } from '../todos/components/StatusBar'
import { TodoLists } from '../todos/components/TodoLists'

/** @typedef {ReturnType<typeof createStoryServer>} StoryServer */

/**
 * Wire a Todo client to an in-memory fake datom server (Storybook / composed plays).
 *
 * @param {ReturnType<typeof createFakeDatomServer> | StoryServer} server
 */
export const createClientForServer = (server) =>
  createTodoClient({
    apiBase: '',
    EventSourceImpl: /** @type {typeof EventSource} */ (
      /** @type {unknown} */ (server.FakeEventSource)
    ),
    fetchImpl: server.fetchImpl,
  })

/**
 * @param {{
 *   startTime?: number,
 *   seed?: import('@web-interview/todos/types').Datom[],
 * }} [options]
 */
export const createStoryServer = ({ startTime, seed = [] } = {}) => {
  const server = createFakeDatomServer({ startTime })
  if (seed.length > 0) server.seed(seed)

  // Mutable delegate so plays can intercept POSTs after the client closes over fetchImpl.
  const baseFetchImpl = server.fetchImpl
  let fetchImpl = baseFetchImpl
  return {
    ...server,
    baseFetchImpl,
    fetchImpl: /** @type {typeof fetch} */ ((...args) => fetchImpl(...args)),
    /** @param {typeof fetch} next */
    setFetchImpl: (next) => {
      fetchImpl = next
    },
    restoreFetchImpl: () => {
      fetchImpl = baseFetchImpl
    },
  }
}

/**
 * StatusBar + TodoLists sharing one runtime against a fake server.
 *
 * @param {{server: StoryServer, style?: React.CSSProperties}} props
 */
export const ComposedTodoApp = ({ server, style = {} }) => {
  const runtime = useTodoLists({
    createClient: () => createClientForServer(server),
  })
  return (
    <>
      <StatusBar runtime={runtime} />
      <TodoLists runtime={runtime} style={style} />
    </>
  )
}

/**
 * Wait until the fake stream has opened and editing is enabled.
 *
 * @param {{findByRole: Function}} canvas
 * @param {{(actual: unknown): {toBeEnabled: () => unknown}}} expect
 */
export const waitUntilConnected = async (canvas, expect) => {
  const add = await canvas.findByRole('button', { name: 'Add Todo List' })
  await expect(add).toBeEnabled()
}
