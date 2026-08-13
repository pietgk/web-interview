import React from 'react'
import type { Datom } from '@web-interview/todos/types'
import App from '../App.tsx'
import { createFakeDatomServer } from './fakeDatomServer.ts'
import { createTodoClient } from '../todos/todoClient.ts'

export type StoryServer = ReturnType<typeof createStoryServer>

/** Wire a Todo client to an in-memory fake datom server (Storybook / composed plays). */
export const createClientForServer = (server: ReturnType<typeof createFakeDatomServer> | StoryServer) =>
  createTodoClient({
    apiBase: '',
    EventSourceImpl: server.FakeEventSource as unknown as typeof EventSource,
    fetchImpl: server.fetchImpl,
  })

export const createStoryServer = ({ startTime, seed = [] }: {
  startTime?: number | undefined
  seed?: Datom[]
} = {}) => {
  const server = createFakeDatomServer({ startTime })
  if (seed.length > 0) server.seed(seed)

  // Mutable delegate so plays can intercept POSTs after the client closes over fetchImpl.
  const baseFetchImpl = server.fetchImpl
  let fetchImpl = baseFetchImpl
  return {
    ...server,
    baseFetchImpl,
    fetchImpl: ((...args: Parameters<typeof fetch>) => fetchImpl(...args)) as typeof fetch,
    setFetchImpl: (next: typeof fetch) => {
      fetchImpl = next
    },
    restoreFetchImpl: () => {
      fetchImpl = baseFetchImpl
    },
  }
}

/** Full App layout against a fake server (same shell as production / App stories). */
export const ComposedTodoApp = ({ server }: {server: StoryServer}) => (
  <App createClient={() => createClientForServer(server)} />
)

/** Wait until the fake stream has opened and editing is enabled. */
export const waitUntilConnected = async (
  canvas: {findByRole: Function}, // eslint-disable-line @typescript-eslint/no-unsafe-function-type -- original JSDoc canvas.findByRole type
  expect: {(actual: unknown): {toBeEnabled: () => unknown}}
) => {
  const add = await canvas.findByRole('button', { name: 'Add Todo List' })
  await expect(add).toBeEnabled()
}
