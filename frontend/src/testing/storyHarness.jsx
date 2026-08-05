import React from 'react'
import App from '../App'
import { createFakeDatomServer } from './fakeDatomServer'
import { createTodoClient } from '../todos/todoClient'

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
 * Full App layout against a fake server (same shell as production / App stories).
 *
 * @param {{server: StoryServer}} props
 */
export const ComposedTodoApp = ({ server }) => (
  <App createClient={() => createClientForServer(server)} />
)

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
