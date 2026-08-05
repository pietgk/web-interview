import { ATTRIBUTE } from '@web-interview/todos/datom'
import {
  SAVING_INDICATOR_DELAY_MS,
  TEXT_SETTLE_MS,
} from '@web-interview/todos/protocol'
import { listId, todoId, ulid } from '@web-interview/todos/ulid'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import {
  ComposedTodoApp,
  createStoryServer,
  waitUntilConnected,
} from '../../testing/storyHarness'

let clock = 1_760_000_000_000
const at = () => (clock += 1)

const FIRST_LIST = listId(at())
const FIRST_TODO = todoId(FIRST_LIST, at())
const SECOND_LIST = listId(at())
const SECOND_TODO = todoId(SECOND_LIST, at())

/** @returns {import('@web-interview/todos/types').Datom[]} */
const seedDatoms = () => [
  [FIRST_LIST, ATTRIBUTE.TITLE, 'First List', ulid(at()), true],
  [FIRST_TODO, ATTRIBUTE.TEXT, 'First todo of first list!', ulid(at()), true],
  [SECOND_LIST, ATTRIBUTE.TITLE, 'Second List', ulid(at()), true],
  [SECOND_TODO, ATTRIBUTE.TEXT, 'First todo of second list!', ulid(at()), true],
]

const settle = () => new Promise((resolve) => setTimeout(resolve, TEXT_SETTLE_MS + 50))

/** @param {import('@web-interview/todos/types').Datom[]} [seed] */
const withServer = (seed = seedDatoms()) => ({
  loaders: [async () => ({ server: createStoryServer({ seed }) })],
  render: (/** @type {unknown} */ _args, /** @type {{loaded: Record<string, any>}} */ { loaded }) => (
    <ComposedTodoApp server={loaded.server} />
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

const meta = /** @type {import('@storybook/react-vite').Meta} */ ({
  title: 'Todos/TodoLists',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: [
          '**TodoLists** is the composed Todo Lists UI (summaries, active list editor, delete confirm). Stories mount the real **App** layout against an in-memory datom server so status, lists, and editor stay wired as in production.',
          '**Docs vs story Canvas:** Each preview on this Docs page is the **before-`play` setup** (seed / loaders only). Open the matching **story** in the sidebar to see the **after-`play` result** — that is what Why/See describe, and what Interactions asserts. Docs does not autoplay: running every `play` on one page races focus and typing across stories.',
          'Wire-level proofs (POSTs, settle coalescing) are noted under **Proof** only when they are not obvious on the canvas.',
        ].join('\n\n'),
      },
    },
  },
})

export default meta

/** @type {import('@storybook/react-vite').StoryObj} */
export const SummariesFromProjection = {
  ...withServer(),
  ...storyDocs([
    '**Why:** List recaps come from the projected read model, not from ad-hoc UI state.',
    '**See:** After the second list’s only Todo is retracted, First List shows `0 of 1 completed` and Second List shows `No todos yet`.',
  ].join(' ')),
  play: async ({ canvas, loaded }) => {
    loaded.server.push([[SECOND_TODO, ATTRIBUTE.TEXT, 'First todo of second list!', ulid(at()), false]])
    await waitUntilConnected(canvas, expect)
    await expect(canvas.getByText('0 of 1 completed')).toBeInTheDocument()
    await expect(canvas.getByText('No todos yet')).toBeInTheDocument()
  },
}

/** @type {import('@storybook/react-vite').StoryObj} */
export const EditingDisabledUntilClock = {
  ...storyDocs([
    '**Why:** Editing stays off until the client has a server clock — no edits against an unsynced stream.',
    '**See:** Add Todo List is disabled; status shows Connection lost. Lists stay empty because the stream never opened.',
  ].join(' ')),
  loaders: [
    async () => {
      const server = createStoryServer({ seed: seedDatoms() })
      server.disconnect()
      return { server }
    },
  ],
  render: (/** @type {unknown} */ _args, /** @type {{loaded: Record<string, any>}} */ { loaded }) => (
    <ComposedTodoApp server={loaded.server} />
  ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('button', { name: 'Add Todo List' })).toBeDisabled()
    await expect(canvas.getByRole('alert')).toHaveTextContent('Connection lost')
  },
}

/** @type {import('@storybook/react-vite').StoryObj} */
export const EditingStaysEnabledOffline = {
  ...withServer(),
  ...storyDocs([
    '**Why:** Once the client has a clock, losing the connection must not lock the UI — local edits stay allowed.',
    '**See:** After disconnect, Add stays enabled, the active Todo can be edited to `Written while offline`, and status shows Waiting for connection.',
  ].join(' ')),
  play: async ({ canvas, loaded }) => {
    await waitUntilConnected(canvas, expect)
    await userEvent.click(canvas.getByText('First List'))
    loaded.server.disconnect()

    await expect(canvas.getByRole('button', { name: 'Add Todo List' })).toBeEnabled()
    const field = canvas.getByLabelText('What to do?')
    await userEvent.clear(field)
    await userEvent.type(field, 'Written while offline')
    await settle()

    await expect(field).toHaveValue('Written while offline')
    await expect(canvas.getByRole('alert')).toHaveTextContent('Waiting for connection')
  },
}

/** @type {import('@storybook/react-vite').StoryObj} */
export const OneDatomPerSettledEdit = {
  ...withServer(),
  ...storyDocs([
    '**Why:** Typing must settle into a single write, not one datom per keystroke.',
    '**See:** The Todo text becomes `Settled once` after the settle delay.',
    '**Proof:** `play` asserts exactly one POST with that text — not visible on the canvas.',
  ].join(' ')),
  play: async ({ canvas, loaded }) => {
    /** @type {Parameters<typeof fetch>[]} */
    const posted = []
    loaded.server.setFetchImpl(
      /** @type {typeof fetch} */ (
        async (input, init) => {
          posted.push([input, init])
          return loaded.server.baseFetchImpl(input, init)
        }
      )
    )

    await waitUntilConnected(canvas, expect)
    await userEvent.click(canvas.getByText('First List'))

    const field = canvas.getByLabelText('What to do?')
    await userEvent.clear(field)
    await userEvent.type(field, 'Settled once')
    await expect(posted).toHaveLength(0)

    await settle()
    await waitFor(() => expect(posted).toHaveLength(1))
    const { datoms } = JSON.parse(String(posted[0][1]?.body))
    await expect(datoms).toEqual([
      [FIRST_TODO, ATTRIBUTE.TEXT, 'Settled once', expect.any(String), true],
    ])
    await expect(loaded.server.store.readModel()[FIRST_LIST].todos[0].text).toBe('Settled once')
  },
}

/** @type {import('@storybook/react-vite').StoryObj} */
export const SavingAppearsAfterDelay = {
  ...withServer(),
  ...storyDocs([
    '**Why:** The Saving… indicator is delayed so fast round-trips do not flicker the status line.',
    '**See:** Status stays All changes saved through settle, then shows Saving… while the POST is held, then returns to All changes saved when released.',
  ].join(' ')),
  play: async ({ canvas, loaded }) => {
    /** @type {(() => void) | undefined} */
    let releasePost
    loaded.server.setFetchImpl(
      () =>
        new Promise((resolve) => {
          releasePost = () =>
            resolve(
              /** @type {Response} */ (
                /** @type {unknown} */ ({
                  ok: true,
                  status: 200,
                  json: async () => ({ serverTime: loaded.server.serverTime() }),
                })
              )
            )
        })
    )

    await waitUntilConnected(canvas, expect)
    await userEvent.click(canvas.getByText('First List'))
    await userEvent.type(canvas.getByLabelText('What to do?'), '!')
    await settle()

    await expect(canvas.getByRole('status')).toHaveTextContent('All changes saved')
    await new Promise((resolve) => setTimeout(resolve, SAVING_INDICATOR_DELAY_MS + 50))
    await expect(canvas.getByRole('status')).toHaveTextContent('Saving…')

    releasePost?.()
    await waitFor(() =>
      expect(canvas.getByRole('status')).toHaveTextContent('All changes saved')
    )
  },
}

/** @type {import('@storybook/react-vite').StoryObj} */
export const RemoteWriteAppears = {
  ...withServer(),
  ...storyDocs([
    '**Why:** Remote stream writes must show up in the summaries without a local edit.',
    '**See:** After another-tab Todo is pushed onto First List, the recap becomes `0 of 2 completed`.',
  ].join(' ')),
  play: async ({ canvas, loaded }) => {
    await waitUntilConnected(canvas, expect)
    loaded.server.push([
      [todoId(FIRST_LIST, at()), ATTRIBUTE.TEXT, 'From another tab', ulid(at()), true],
    ])
    await expect(await canvas.findByText('0 of 2 completed')).toBeInTheDocument()
  },
}

/** @type {import('@storybook/react-vite').StoryObj} */
export const ReplacedLogResetsClient = {
  ...withServer(),
  ...storyDocs([
    '**Why:** A replaced journal (new epoch) must reset the client so old and new logs never merge on screen.',
    '**See:** Two lists become a single `Only List`; First List and Second List disappear.',
  ].join(' ')),
  play: async ({ canvas, loaded }) => {
    await waitUntilConnected(canvas, expect)
    await expect(canvas.getAllByRole('listitem')).toHaveLength(2)

    // A server whose journal was wiped re-seeds with fresh ids minted now, so
    // they sort above the cursor this client already holds. Without the epoch the
    // client would keep the old Todo Lists and show both logs at once.
    const freshList = listId(at())
    loaded.server.replaceLog([
      [freshList, ATTRIBUTE.TITLE, 'Only List', ulid(at()), true],
      [todoId(freshList, at()), ATTRIBUTE.TEXT, 'Only todo', ulid(at()), true],
    ])

    await waitFor(async () => {
      await expect(canvas.getAllByRole('listitem')).toHaveLength(1)
    })
    await expect(canvas.getByText('Only List')).toBeInTheDocument()
    await expect(canvas.queryByText('First List')).not.toBeInTheDocument()
    await expect(canvas.queryByText('Second List')).not.toBeInTheDocument()
  },
}

/** @type {import('@storybook/react-vite').StoryObj} */
export const LocalCompletionUpdatesSummary = {
  ...withServer(),
  ...storyDocs([
    '**Why:** Completing a Todo must refresh that list’s summary while keeping selection.',
    '**See:** Mark the First List Todo done → recap becomes `1 of 1 completed`, and First List stays current.',
  ].join(' ')),
  play: async ({ canvas }) => {
    await waitUntilConnected(canvas, expect)
    await userEvent.click(canvas.getByText('First List'))
    await userEvent.click(canvas.getByLabelText('Mark completed: First todo of first list!'))
    await expect(canvas.getByText('1 of 1 completed')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: /^First List / })).toHaveAttribute(
      'aria-current',
      'true'
    )
  },
}

/** @type {import('@storybook/react-vite').StoryObj} */
export const GhostComposerLifecycle = {
  ...withServer(),
  ...storyDocs([
    '**Why:** The ghost composer materializes a Todo on settle/Enter and dematerializes when cleared blank.',
    '**See:** Typing in Add a todo does not add a row until Enter; then a Todo appears. A temporary settled Todo disappears again when the composer is cleared.',
  ].join(' ')),
  play: async ({ canvas }) => {
    await waitUntilConnected(canvas, expect)
    await userEvent.click(canvas.getByText('First List'))

    const composer = canvas.getByLabelText('Add a todo')
    await userEvent.type(composer, 'Ghost born')
    await expect(canvas.getAllByLabelText('What to do?')).toHaveLength(1)
    await settle()
    await expect(canvas.getAllByLabelText('What to do?')).toHaveLength(1)

    await userEvent.keyboard('{Enter}')
    await expect(canvas.getAllByLabelText('What to do?')).toHaveLength(2)
    await expect(canvas.getAllByLabelText('What to do?')[0]).toHaveValue('Ghost born')

    await userEvent.type(composer, 'Temporary')
    await settle()
    await userEvent.clear(composer)
    await settle()
    await expect(canvas.queryByDisplayValue('Temporary')).not.toBeInTheDocument()
  },
}

/** @type {import('@storybook/react-vite').StoryObj} */
export const NamedRegions = {
  ...withServer(),
  ...storyDocs([
    '**Why:** The active list exposes stable accessible regions so assistive tech (and tests) can find editor vs composer.',
    '**See:** With First List open, the canvas has a `Todo editor` region and a `New todo` group — check the accessibility tree if it is not obvious visually.',
  ].join(' ')),
  play: async ({ canvas }) => {
    await waitUntilConnected(canvas, expect)
    await userEvent.click(canvas.getByText('First List'))
    await expect(canvas.getByRole('region', { name: 'Todo editor' })).toBeInTheDocument()
    await expect(canvas.getByRole('group', { name: 'New todo' })).toBeInTheDocument()
  },
}

/** @type {import('@storybook/react-vite').StoryObj} */
export const DraftMaterializesOnSettle = {
  ...withServer(),
  ...storyDocs([
    '**Why:** A new Todo List is a draft until its title settles — no composer, and Add does not spawn a second draft.',
    '**See:** Add focuses Todo List name with no Add a todo yet; after typing `Release` and settling, the composer appears and Release is selected with `No todos yet`.',
  ].join(' ')),
  play: async ({ canvas }) => {
    await waitUntilConnected(canvas, expect)

    const add = canvas.getByRole('button', { name: 'Add Todo List' })
    await userEvent.click(add)
    await expect(canvas.getByLabelText('Todo List name')).toHaveFocus()
    await expect(canvas.queryByLabelText('Add a todo')).not.toBeInTheDocument()
    await userEvent.click(add)
    await expect(canvas.getByLabelText('Todo List name')).toHaveFocus()
    await expect(canvas.getAllByLabelText('Todo List name')).toHaveLength(1)

    await userEvent.type(canvas.getByLabelText('Todo List name'), 'Release')
    await expect(canvas.queryByLabelText('Add a todo')).not.toBeInTheDocument()
    await settle()

    await expect(canvas.getByLabelText('Add a todo')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: /^Release No todos yet$/ })).toHaveAttribute(
      'aria-current',
      'true'
    )
  },
}

/** @type {import('@storybook/react-vite').StoryObj} */
export const DeleteEmptyAndConfirmPopulated = {
  ...withServer(),
  ...storyDocs([
    '**Why:** Empty Todo Lists delete immediately; populated ones require confirm, cancel must keep the list, and focus returns to Add when none remain.',
    '**See:** Second List (empty) vanishes with no dialog; First List opens Delete First List?, Cancel keeps it, Confirm removes it and focuses Add Todo List.',
  ].join(' ')),
  play: async ({ canvas, loaded }) => {
    loaded.server.push([[SECOND_TODO, ATTRIBUTE.TEXT, 'First todo of second list!', ulid(at()), false]])
    await waitUntilConnected(canvas, expect)

    await userEvent.click(canvas.getByRole('button', { name: 'Delete Todo List: Second List' }))
    await expect(canvas.queryByRole('dialog')).not.toBeInTheDocument()
    await expect(canvas.queryByText('Second List')).not.toBeInTheDocument()

    await userEvent.click(canvas.getByRole('button', { name: 'Delete Todo List: First List' }))
    await expect(await screen.findByRole('dialog', { name: 'Delete First List?' })).toHaveTextContent(
      '1 Todo will also disappear.'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await expect(canvas.getByText('First List')).toBeInTheDocument()

    await userEvent.click(canvas.getByRole('button', { name: 'Delete Todo List: First List' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete Todo List' }))
    await expect(canvas.queryByText('First List')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Add Todo List' })).toHaveFocus()
    )
  },
}

/** @type {import('@storybook/react-vite').StoryObj} */
export const ResortKeepsSelection = {
  ...storyDocs([
    '**Why:** Changing due dates may reorder Todo Lists, but the active selection must follow the same list.',
    '**See:** Second List starts first (earlier due date); after moving First List’s due date earlier, First List becomes first and stays `aria-current`.',
  ].join(' ')),
  loaders: [
    async () => {
      const server = createStoryServer({
        seed: [
          ...seedDatoms(),
          [FIRST_TODO, ATTRIBUTE.DUE_DATE, '2099-02-01', ulid(at()), true],
          [SECOND_TODO, ATTRIBUTE.DUE_DATE, '2099-01-01', ulid(at()), true],
        ],
      })
      return { server }
    },
  ],
  render: (/** @type {unknown} */ _args, /** @type {{loaded: Record<string, any>}} */ { loaded }) => (
    <ComposedTodoApp server={loaded.server} />
  ),
  play: async ({ canvas }) => {
    await waitUntilConnected(canvas, expect)

    const list = canvas.getByRole('list', { name: 'Todo lists' })
    await expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Second List')
    await userEvent.click(canvas.getByText('First List'))
    const dueDate = canvas.getByDisplayValue('2099-02-01')
    await userEvent.clear(dueDate)
    await userEvent.type(dueDate, '2098-01-01')

    await expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('First List')
    await expect(canvas.getByRole('button', { name: /^First List / })).toHaveAttribute(
      'aria-current',
      'true'
    )
  },
}
