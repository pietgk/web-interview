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

const meta = /** @type {import('@storybook/react-vite').Meta} */ ({
  title: 'Todos/TodoLists',
  parameters: {
    layout: 'fullscreen',
  },
})

export default meta

/** @type {import('@storybook/react-vite').StoryObj} */
export const SummariesFromProjection = {
  ...withServer(),
  play: async ({ canvas, loaded }) => {
    loaded.server.push([[SECOND_TODO, ATTRIBUTE.TEXT, 'First todo of second list!', ulid(at()), false]])
    await waitUntilConnected(canvas, expect)
    await expect(canvas.getByText('0 of 1 completed')).toBeInTheDocument()
    await expect(canvas.getByText('No todos yet')).toBeInTheDocument()
  },
}

/** @type {import('@storybook/react-vite').StoryObj} */
export const EditingDisabledUntilClock = {
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
