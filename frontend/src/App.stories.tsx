import type { Meta, StoryObj } from '@storybook/react-vite'
import { ATTRIBUTE } from '@web-interview/todos/datom'
import type { Datom } from '@web-interview/todos/types'
import { listId, todoId, ulid } from '@web-interview/todos/ulid'
import { expect } from 'storybook/test'
import App from './App.tsx'
import {
  createClientForServer,
  createStoryServer,
  waitUntilConnected,
} from './testing/storyHarness.tsx'
import { storyDocs } from './testing/storyDocs.ts'

const INITIAL_STORY_TIME_MS = 1_760_000_000_000

let clock = INITIAL_STORY_TIME_MS
const nextTimestamp = () => (clock += 1)

const FIRST_LIST = listId(nextTimestamp())
const FIRST_TODO = todoId(FIRST_LIST, nextTimestamp())

const seededLists = (): Datom[] => [
  [FIRST_LIST, ATTRIBUTE.TITLE, 'First List', ulid(nextTimestamp()), true],
  [FIRST_TODO, ATTRIBUTE.TEXT, 'First todo of first list!', ulid(nextTimestamp()), true],
]

const withServer = (seed: Datom[] = []) => ({
  loaders: [
    async () => ({ server: createStoryServer({ seed }) }),
  ],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- original JSDoc loader bag
  render: (_args: unknown, { loaded }: {loaded: Record<string, any>}) => (
    <App createClient={() => createClientForServer(loaded.server)} />
  ),
})

const meta = ({
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
}) as Meta<typeof App>

export default meta

export const Empty = ({
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
}) as StoryObj<typeof App>

export const Populated = ({
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
}) as StoryObj<typeof App>
