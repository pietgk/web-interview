import type { Meta, StoryObj } from '@storybook/react-vite'
import type { TodoClientStatus } from '@web-interview/todos/types'
import { expect, fn, screen, userEvent } from 'storybook/test'
import { storyDocs } from '../../testing/storyDocs.ts'
import type { TodoRuntime } from '../useTodoLists.ts'
import { StatusBar } from './StatusBar.tsx'

const STATUS_BAR_SCENARIO_DAY = '2026-07-31'
const VALIDATION_ERROR_STATUS = 400

const runtime = (overrides: Partial<TodoClientStatus> = {}): TodoRuntime => ({
  client: { reconnect: fn() } as unknown as TodoRuntime['client'],
  readModel: {},
  today: STATUS_BAR_SCENARIO_DAY,
  status: {
    connection: 'live' as const,
    pendingCount: 0,
    saving: false,
    canEdit: true,
    rehydrating: false,
    failure: null,
    epoch: 'epoch',
    ...overrides,
  },
})

const meta = ({
  title: 'Todos/StatusBar',
  component: StatusBar,
  parameters: {
    docs: {
      description: {
        component: [
          '**StatusBar** is the app chrome line: title **Things to do** plus connection/delivery copy from `selectStatusBar`. Severity drives the Alert look and the accessible role (`status` for success/info, `alert` for warning/error).',
          'Optional **Details** opens `StatusDetailsDialog` with `status.details`; **Reconnect** calls `client.reconnect()`. Stories pass a fake `runtime` — no datom server.',
          'Catalog mirrors the selector priorities: connecting → failed → reconnecting → live delivery stall → saving → all saved. Plays assert role, copy, and actions; dialog dismiss itself is covered under StatusDetailsDialog.',
        ].join('\n\n'),
      },
    },
  },
}) as Meta<typeof StatusBar>

export default meta

export const AllChangesSaved = ({
  args: { runtime: runtime() },
  ...storyDocs([
    '**Why:** The healthy baseline — stream live, nothing pending long enough to matter.',
    '**See:** `status` region Application status with h1 Things to do and All changes saved; no Details or Reconnect.',
  ].join(' ')),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { level: 1, name: 'Things to do' })).toBeInTheDocument()
    const bar = canvas.getByRole('status', { name: 'Application status' })
    await expect(bar).toHaveTextContent('All changes saved')
    await expect(bar).not.toHaveTextContent('Connection lost')
  },
}) as StoryObj<typeof StatusBar>

export const Connecting = ({
  args: { runtime: runtime({ connection: 'connecting', canEdit: false }) },
  ...storyDocs([
    '**Why:** First paint / stream open — editing is held until the clock arrives, and the bar says so.',
    '**See:** `status` region with Connecting…; no Reconnect.',
  ].join(' ')),
  play: async ({ canvas }) => {
    const bar = canvas.getByRole('status', { name: 'Application status' })
    await expect(bar).toHaveTextContent('Connecting…')
    await expect(canvas.queryAllByRole('button')).toHaveLength(0)
  },
}) as StoryObj<typeof StatusBar>

export const Saving = ({
  args: { runtime: runtime({ pendingCount: 1, saving: true }) },
  ...storyDocs([
    '**Why:** An in-flight outbox that has been pending long enough shows Saving… (not forever while stalled).',
    '**See:** `status` region with Saving…; no Details or Reconnect.',
  ].join(' ')),
  play: async ({ canvas }) => {
    const bar = canvas.getByRole('status', { name: 'Application status' })
    await expect(bar).toHaveTextContent('Saving…')
    await expect(canvas.queryAllByRole('button')).toHaveLength(0)
  },
}) as StoryObj<typeof StatusBar>

export const WaitingWhileLive = ({
  args: {
    runtime: runtime({
      pendingCount: 1,
      saving: true,
      failure: {
        kind: 'network',
        status: null,
        code: 'NETWORK_ERROR',
        message: 'Could not reach the server',
        issues: [],
      },
    }),
  },
  ...storyDocs([
    '**Why:** A live stream with a pending outbox that cannot drain must not say Saving… — it waits, with Details.',
    '**See:** `alert` Application status with Waiting for connection; Details shows the error reason.',
  ].join(' ')),
  play: async ({ canvas }) => {
    const bar = canvas.getByRole('alert', { name: 'Application status' })
    await expect(bar).toHaveTextContent('Waiting for connection')
    await expect(bar).not.toHaveTextContent('Saving…')
    await userEvent.click(canvas.getByRole('button', { name: 'Details' }))
    await expect(await screen.findByRole('dialog', { name: 'Status details' })).toHaveTextContent(
      'Could not reach the server'
    )
  },
}) as StoryObj<typeof StatusBar>

export const ChangesNotSaved = ({
  args: {
    runtime: runtime({
      rehydrating: true,
      canEdit: false,
      failure: {
        kind: 'api',
        status: VALIDATION_ERROR_STATUS,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        issues: [{ path: ['datoms', 0, 2], message: 'Invalid Todo text' }],
      },
    }),
  },
  ...storyDocs([
    '**Why:** A permanent rejection must remain visible while authoritative state is restored and until a later write succeeds.',
    '**See:** `alert` Application status says Changes not saved; Details preserves HTTP status, public code, message, and issues.',
  ].join(' ')),
  play: async ({ canvas }) => {
    const bar = canvas.getByRole('alert', { name: 'Application status' })
    await expect(bar).toHaveTextContent('Changes not saved')
    await expect(bar).not.toHaveTextContent('All changes saved')
    await userEvent.click(canvas.getByRole('button', { name: 'Details' }))
    const dialog = await screen.findByRole('dialog', { name: 'Status details' })
    await expect(dialog).toHaveTextContent('Validation failed')
    await expect(dialog).toHaveTextContent('VALIDATION_ERROR')
    await expect(dialog).toHaveTextContent('400')
    await expect(dialog).toHaveTextContent('datoms.0.2: Invalid Todo text')
  },
}) as StoryObj<typeof StatusBar>

export const Reconnecting = ({
  args: { runtime: runtime({ connection: 'reconnecting', canEdit: true }) },
  ...storyDocs([
    '**Why:** Stream dropped with an empty outbox — recover quietly without implying local edits are stuck.',
    '**See:** `alert` with Connection lost and Reconnecting…; no Reconnect button (auto-retry).',
  ].join(' ')),
  play: async ({ canvas }) => {
    const bar = canvas.getByRole('alert', { name: 'Application status' })
    await expect(bar).toHaveTextContent(/Connection lost/)
    await expect(bar).toHaveTextContent('Reconnecting…')
    await expect(bar).not.toHaveTextContent('Waiting for connection')
    await expect(canvas.queryAllByRole('button')).toHaveLength(0)
  },
}) as StoryObj<typeof StatusBar>

export const WaitingOffline = ({
  args: { runtime: runtime({ connection: 'reconnecting', pendingCount: 2, canEdit: true }) },
  ...storyDocs([
    '**Why:** Stream dropped while edits are queued — copy must say we are waiting to deliver, not merely reconnecting.',
    '**See:** `alert` with Connection lost and Waiting for connection.',
  ].join(' ')),
  play: async ({ canvas }) => {
    const bar = canvas.getByRole('alert', { name: 'Application status' })
    await expect(bar).toHaveTextContent(/Connection lost/)
    await expect(bar).toHaveTextContent('Waiting for connection')
    await expect(bar).not.toHaveTextContent('Reconnecting…')
  },
}) as StoryObj<typeof StatusBar>

export const ConnectionFailed = ({
  args: {
    runtime: runtime({
      connection: 'failed',
      canEdit: false,
      failure: {
        kind: 'network',
        status: null,
        code: 'NETWORK_ERROR',
        message: 'Gateway unavailable',
        issues: [],
      },
    }),
  },
  ...storyDocs([
    '**Why:** Hard failure needs an alert, the error reason via Details, and a manual Reconnect.',
    '**See:** `alert` Connection lost; Details opens Status details with Gateway unavailable; Reconnect calls `client.reconnect()`.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    const bar = canvas.getByRole('alert', { name: 'Application status' })
    await expect(bar).toHaveTextContent('Connection lost')

    await userEvent.click(canvas.getByRole('button', { name: 'Details' }))
    await expect(await screen.findByRole('dialog', { name: 'Status details' })).toHaveTextContent(
      'Gateway unavailable'
    )
    // Dismiss without asserting DOM absence (that is StatusDetailsDialog’s Close contract).
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    await userEvent.click(canvas.getByRole('button', { name: 'Reconnect' }))
    await expect(args.runtime.client.reconnect).toHaveBeenCalledTimes(1)
  },
}) as StoryObj<typeof StatusBar>

export const ConnectionFailedNoDetails = ({
  args: { runtime: runtime({ connection: 'failed', failure: null, canEdit: false }) },
  ...storyDocs([
    '**Why:** Failure without a reason string still offers Reconnect, but must not invent a Details panel.',
    '**See:** `alert` Connection lost and Reconnect only — no Details button.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    const bar = canvas.getByRole('alert', { name: 'Application status' })
    await expect(bar).toHaveTextContent('Connection lost')
    await expect(canvas.queryAllByRole('button', { name: 'Details' })).toHaveLength(0)
    await userEvent.click(canvas.getByRole('button', { name: 'Reconnect' }))
    await expect(args.runtime.client.reconnect).toHaveBeenCalledTimes(1)
  },
}) as StoryObj<typeof StatusBar>
