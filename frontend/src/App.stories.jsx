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

/** @param {string} story */
const storyDocs = (story) => ({
  parameters: {
    docs: {
      description: { story },
    },
  },
})

const meta = /** @type {import('@storybook/react-vite').Meta<typeof App>} */ ({
  title: 'App',
  component: App,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: [
          '**App** is the production shell: StatusBar + TodoLists sharing one runtime, with the real layout (sticky status, scrollable main). Stories wire an in-memory datom server through `createClient`.',
          '**Docs vs story Canvas:** Each preview on this Docs page is the **before-`play` setup** (seed / loaders only). Open the matching **story** in the sidebar to see the **after-`play` result** — that is what Why/See describe, and what Interactions asserts. Docs does not autoplay: running every `play` on one page races focus and typing across stories.',
          'Wire-level proofs are noted under **Proof** only when they are not obvious on the canvas.',
        ].join('\n\n'),
      },
    },
  },
})

export default meta

export const Empty = /** @type {import('@storybook/react-vite').StoryObj<typeof App>} */ ({
  ...withServer(),
  ...storyDocs([
    '**Why:** The empty catalog is a first-class shell state — heading and status still mount when there are no Todo Lists.',
    '**See:** After the stream connects, the h1 is Things to do and the lists panel shows `No Todo Lists yet.`',
  ].join(' ')),
  play: async ({ canvas }) => {
    await waitUntilConnected(canvas, expect)
    await expect(canvas.getByRole('heading', { level: 1, name: 'Things to do' })).toBeInTheDocument()
    await expect(canvas.getByText('No Todo Lists yet.')).toBeInTheDocument()
  },
})

export const Populated = /** @type {import('@storybook/react-vite').StoryObj<typeof App>} */ ({
  ...withServer(seededLists()),
  ...storyDocs([
    '**Why:** A seeded journal must project into the shell — list summaries and a healthy status line.',
    '**See:** First List with `0 of 1 completed`, and Application status shows All changes saved.',
  ].join(' ')),
  play: async ({ canvas }) => {
    await waitUntilConnected(canvas, expect)
    await expect(canvas.getByText('First List')).toBeInTheDocument()
    await expect(canvas.getByText('0 of 1 completed')).toBeInTheDocument()
    await expect(canvas.getByRole('status', { name: 'Application status' })).toHaveTextContent(
      'All changes saved'
    )
  },
})
