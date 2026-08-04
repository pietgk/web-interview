import { ATTRIBUTE } from '@web-interview/todos/datom'
import { listId, todoId, ulid } from '@web-interview/todos/ulid'
import { expect } from 'storybook/test'
import App from './App'
import {
  createClientForServer,
  createStoryServer,
  waitUntilConnected,
} from './testing/storyHarness'

let clock = 1_760_000_000_000
const at = () => (clock += 1)

const FIRST_LIST = listId(at())
const FIRST_TODO = todoId(FIRST_LIST, at())

/** @returns {import('@web-interview/todos/types').Datom[]} */
const seededLists = () => [
  [FIRST_LIST, ATTRIBUTE.TITLE, 'First List', ulid(at()), true],
  [FIRST_TODO, ATTRIBUTE.TEXT, 'First todo of first list!', ulid(at()), true],
]

/** @param {import('@web-interview/todos/types').Datom[]} [seed] */
const withServer = (seed = []) => ({
  loaders: [
    async () => ({ server: createStoryServer({ seed }) }),
  ],
  render: (/** @type {unknown} */ _args, /** @type {{loaded: Record<string, any>}} */ { loaded }) => (
    <App createClient={() => createClientForServer(loaded.server)} />
  ),
})

const meta = /** @type {import('@storybook/react-vite').Meta<typeof App>} */ ({
  title: 'App',
  component: App,
  parameters: {
    layout: 'fullscreen',
  },
})

export default meta

export const Empty = /** @type {import('@storybook/react-vite').StoryObj<typeof App>} */ ({
  ...withServer(),
  play: async ({ canvas }) => {
    await waitUntilConnected(canvas, expect)
    await expect(canvas.getByRole('heading', { level: 1, name: 'Things to do' })).toBeInTheDocument()
    await expect(canvas.getByText('No Todo Lists yet.')).toBeInTheDocument()
  },
})

export const Populated = /** @type {import('@storybook/react-vite').StoryObj<typeof App>} */ ({
  ...withServer(seededLists()),
  play: async ({ canvas }) => {
    await waitUntilConnected(canvas, expect)
    await expect(canvas.getByText('First List')).toBeInTheDocument()
    await expect(canvas.getByText('0 of 1 completed')).toBeInTheDocument()
    await expect(canvas.getByRole('status', { name: 'Application status' })).toHaveTextContent(
      'All changes saved'
    )
  },
})
