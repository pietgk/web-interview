import { test, expect } from '@playwright/test'
import { constants as HTTP } from 'node:http2'
import { ATTRIBUTE } from '@web-interview/todos/datom'
import {
  API_ERROR_CODE,
  DATOM_API_PATH,
  TODO_TEXT_MAX_LENGTH,
} from '@web-interview/todos/protocol'
import { EARLIEST_ULID, listId, todoId, ulid } from '@web-interview/todos/ulid'
import { E2E_API_BASE } from './environment.js'
import { PRIMARY_LIST_TITLE, PRIMARY_TODO_TEXT } from './fixture.js'

const primaryListName = new RegExp(`^${PRIMARY_LIST_TITLE} `)
const INVALID_NON_LEAP_DAY = '2026-02-29'
const FAR_FUTURE_DUE_DAY = '2099-01-15'
const HYDRATION_LAYOUT_SETTLE_MS = 50
const OFFLINE_SAVE_TIMEOUT_MS = 30_000

/**
 * Every journey works inside a Todo List it created, so the tests never contend
 * over the seeded ones and need no reset between runs.
 *
 * @param {string} prefix
 */
const uniqueListTitle = (prefix) =>
  `${prefix} ${Date.now()} ${Math.random().toString(16).slice(2)}`

/** @param {import('@playwright/test').Page} page */
const waitForApp = async (page) => {
  await expect(page.getByRole('button', { name: 'Add Todo List' })).toBeEnabled()
}

/** @param {import('@playwright/test').Page} page @param {string} title */
async function startTodoList(page, title) {
  await page.getByRole('button', { name: 'Add Todo List' }).click()
  const titleField = page.getByLabel('Todo List name')
  await expect(titleField).toBeFocused()
  await titleField.fill(title)
  await titleField.press('Enter')
  await expect(page.getByLabel('Add a todo')).toBeVisible()
}

/** @param {import('@playwright/test').Page} page @param {string} text */
async function addTodo(page, text) {
  const composer = page.getByLabel('Add a todo')
  await composer.fill(text)
  await composer.press('Enter')
  await expect(page.getByLabel('What to do?').first()).toHaveValue(text)
}

/** @param {import('@playwright/test').Page} page */
const waitForWrite = (page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().endsWith(DATOM_API_PATH.ROOT) &&
      response.ok()
  )

/** @param {import('@playwright/test').Locator} locator */
const elementHeight = async (locator) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Expected the todo-list button to have a bounding box')
  return box.height
}

test('rejects a due date that does not exist in its month', async ({ request }) => {
  const list = listId(Date.now())
  const todo = todoId(list, Date.now())
  const created = await request.post(`${E2E_API_BASE}${DATOM_API_PATH.ROOT}`, {
    headers: { 'Content-Type': 'application/json' },
    data: {
      datoms: [
        [list, ATTRIBUTE.TITLE, uniqueListTitle('Due date rejection'), ulid(Date.now()), true],
        [todo, ATTRIBUTE.TEXT, 'Todo with a due date', ulid(Date.now()), true],
      ],
    },
  })
  expect(created.ok()).toBe(true)

  const response = await request.post(`${E2E_API_BASE}${DATOM_API_PATH.ROOT}`, {
    headers: { 'Content-Type': 'application/json' },
    data: { datoms: [[todo, ATTRIBUTE.DUE_DATE, INVALID_NON_LEAP_DAY, ulid(Date.now()), true]] },
  })

  expect(response.status()).toBe(HTTP.HTTP_STATUS_BAD_REQUEST)
  await expect(response.json()).resolves.toMatchObject({
    code: API_ERROR_CODE.VALIDATION_ERROR,
    issues: [
      expect.objectContaining({
        message: expect.stringMatching(/Invalid value for dueDate/),
      }),
    ],
  })
})

test('rejects a transaction id dated into the future', async ({ request }) => {
  const list = listId(Date.now())
  const response = await request.post(`${E2E_API_BASE}${DATOM_API_PATH.ROOT}`, {
    headers: { 'Content-Type': 'application/json' },
    data: {
      datoms: [[list, ATTRIBUTE.TITLE, 'From the future', ulid(Date.now() + 60_000), true]],
    },
  })

  expect(response.status()).toBe(HTTP.HTTP_STATUS_BAD_REQUEST)
  await expect(response.json()).resolves.toMatchObject({
    code: API_ERROR_CODE.INVALID_DATOM,
  })
})

test('does not shift Todo List controls while hydrating', async ({ page }) => {
  const layoutShiftLabelsKey = 'todo-list-layout-shift-labels'
  await page.addInitScript((key) => {
    /** @type {string[]} */
    const shiftedLabels = []
    Reflect.set(globalThis, key, shiftedLabels)
    const observer = new PerformanceObserver((list) => {
      for (const observedEntry of list.getEntries()) {
        const entry = /** @type {PerformanceEntry & {hadRecentInput?: boolean, sources?: Array<{node?: Node | null}>}} */ (observedEntry)
        if (entry.hadRecentInput) continue
        for (const source of entry.sources ?? []) {
          if (!(source.node instanceof Element)) continue
          const label = source.node.getAttribute('aria-label')
          if (label) shiftedLabels.push(label)
        }
      }
    })
    observer.observe({ type: 'layout-shift', buffered: true })
  }, layoutShiftLabelsKey)

  await page.goto('/')
  await expect(page.getByText(PRIMARY_LIST_TITLE, { exact: true })).toBeVisible()
  await page.waitForTimeout(HYDRATION_LAYOUT_SETTLE_MS)

  const shiftedLabels = await page.evaluate(
    (key) => Reflect.get(globalThis, key),
    layoutShiftLabelsKey
  )
  expect(shiftedLabels).not.toContain('Add Todo List')
})

test('shows the seeded Todo Lists that survived the server restart', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)

  await page.getByText(PRIMARY_LIST_TITLE, { exact: true }).click()
  await expect(page.getByLabel('What to do?')).toHaveValue(PRIMARY_TODO_TEXT)
})

test('settles a todo edit with Enter before reload', async ({ page }) => {
  const title = uniqueListTitle('Autosave')
  await page.goto('/')
  await waitForApp(page)
  await startTodoList(page, title)
  await addTodo(page, 'Original text')

  const textField = page.getByLabel('What to do?').first()
  const saved = waitForWrite(page)
  await textField.fill('Persisted from e2e')
  await textField.press('Enter')
  await saved
  await expect(page.getByText('All changes saved')).toBeVisible()

  await page.reload()
  await page.getByText(title, { exact: true }).click()
  await expect(page.getByLabel('What to do?').first()).toHaveValue('Persisted from e2e')
})

test('restores the previously settled value when reloaded inside the autosave window', async ({ page }) => {
  const title = uniqueListTitle('Unsettled reload')
  await page.clock.install({ time: Date.now() })
  await page.goto('/')
  await waitForApp(page)
  await startTodoList(page, title)
  const added = waitForWrite(page)
  await addTodo(page, 'Previously settled')
  await added
  await expect(page.getByText('All changes saved')).toBeVisible()

  const textField = page.getByLabel('What to do?').first()
  await textField.fill('Draft inside settle window')
  await expect(textField).toHaveValue('Draft inside settle window')

  await page.reload()
  await page.getByText(title, { exact: true }).click()
  await expect(page.getByLabel('What to do?').first()).toHaveValue('Previously settled')
})

test('restores authoritative text when the server rejects an oversized edit', async ({ page }) => {
  const title = uniqueListTitle('Rejected oversized edit')
  await page.goto('/')
  await waitForApp(page)
  await startTodoList(page, title)
  await addTodo(page, 'Original text')
  await expect(page.getByText('All changes saved')).toBeVisible()

  const textField = page.getByLabel('What to do?').first()
  // Bypass the browser guard to exercise the authoritative server boundary, as
  // a legacy browser or direct client can.
  await textField.evaluate((input) => input.removeAttribute('maxlength'))
  const rejected = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().endsWith(DATOM_API_PATH.ROOT) &&
      response.status() === HTTP.HTTP_STATUS_BAD_REQUEST
  )
  await textField.fill('x'.repeat(TODO_TEXT_MAX_LENGTH + 1))
  await textField.press('Enter')
  await rejected

  await expect(page.getByText('Changes not saved')).toBeVisible()
  await expect(textField).toHaveValue('Original text')

  await page.reload()
  await page.getByText(title, { exact: true }).click()
  await expect(page.getByLabel('What to do?').first()).toHaveValue('Original text')
})

test('marks a todo and its list as completed and persists after refresh', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)
  await page.getByText(PRIMARY_LIST_TITLE, { exact: true }).click()
  const listButton = page.getByRole('button', { name: primaryListName })
  const initialHeight = await elementHeight(listButton)

  const saved = waitForWrite(page)
  await page.getByLabel(`Mark completed: ${PRIMARY_TODO_TEXT}`).check()
  await saved
  await expect(page.getByText('1 of 1 completed')).toBeVisible()
  expect(await elementHeight(listButton)).toBe(initialHeight)
  await expect(page.getByRole('button', { name: primaryListName })).toHaveAttribute(
    'aria-current',
    'true'
  )

  await page.reload()
  await page.getByText(PRIMARY_LIST_TITLE, { exact: true }).click()
  await expect(page.getByLabel(`Mark completed: ${PRIMARY_TODO_TEXT}`)).toBeChecked()
  await expect(page.getByText('1 of 1 completed')).toBeVisible()

  const cleared = waitForWrite(page)
  await page.getByLabel(`Mark completed: ${PRIMARY_TODO_TEXT}`).uncheck()
  await cleared
})

test('shows a due-in label for a due date and persists after refresh', async ({ page }) => {
  const title = uniqueListTitle('Due date')
  const dueInYearsLabel = /Due in \d+ years: Todo with a deadline/
  await page.goto('/')
  await waitForApp(page)
  await startTodoList(page, title)
  await addTodo(page, 'Todo with a deadline')

  const saved = waitForWrite(page)
  await page.getByLabel('Due date: Todo with a deadline').fill(FAR_FUTURE_DUE_DAY)
  await expect(page.getByLabel(dueInYearsLabel)).toHaveValue(FAR_FUTURE_DUE_DAY)
  await saved
  await expect(page.getByText('All changes saved')).toBeVisible()

  await page.reload()
  await page.getByText(title, { exact: true }).click()
  await expect(page.getByLabel(dueInYearsLabel)).toHaveValue(FAR_FUTURE_DUE_DAY)
})

test('refreshes visible and accessible due status across local midnight', async ({ page, request }) => {
  const title = uniqueListTitle('Midnight refresh')
  const text = 'Cross midnight'
  const list = listId(Date.now())
  const todo = todoId(list, Date.now())
  const staleTx = EARLIEST_ULID
  const created = await request.post(`${E2E_API_BASE}${DATOM_API_PATH.ROOT}`, {
    headers: { 'Content-Type': 'application/json' },
    data: {
      datoms: [
        [list, ATTRIBUTE.TITLE, title, staleTx, true],
        [todo, ATTRIBUTE.TEXT, text, staleTx, true],
      ],
    },
  })
  expect(created.ok()).toBe(true)
  const { serverTime } = await created.json()

  await page.clock.install({ time: serverTime })
  const { dueDate, untilMidnight } = await page.evaluate(() => {
    const now = new Date()
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const year = midnight.getFullYear()
    const month = String(midnight.getMonth() + 1).padStart(2, '0')
    const day = String(midnight.getDate()).padStart(2, '0')
    return {
      dueDate: `${year}-${month}-${day}`,
      untilMidnight: midnight.getTime() - Date.now(),
    }
  })
  const dated = await request.post(`${E2E_API_BASE}${DATOM_API_PATH.ROOT}`, {
    headers: { 'Content-Type': 'application/json' },
    data: {
      datoms: [[todo, ATTRIBUTE.DUE_DATE, dueDate, staleTx, true]],
    },
  })
  expect(dated.ok()).toBe(true)

  await page.goto('/')
  await waitForApp(page)
  await page.getByText(title, { exact: true }).click()
  const listButton = page.getByRole('button', { name: new RegExp(`^${title} `) })
  await expect(listButton).toContainText('Due in 1 day')
  await expect(page.getByLabel(`Due in 1 day: ${text}`)).toHaveValue(dueDate)

  await page.clock.runFor(untilMidnight + 1_000)

  await expect(listButton).toContainText('Due today')
  await expect(page.getByLabel(`Due today: ${text}`)).toHaveValue(dueDate)
})

test('keeps a todo edit when switching lists before the text settles', async ({ page }) => {
  const title = uniqueListTitle('Switch away')
  await page.goto('/')
  await waitForApp(page)
  await startTodoList(page, title)
  await addTodo(page, 'Original text')

  const saved = waitForWrite(page)
  await page.getByLabel('What to do?').first().fill('Unsaved switch test')
  await page.getByText(PRIMARY_LIST_TITLE, { exact: true }).click()
  await saved

  await page.getByText(title, { exact: true }).click()
  await expect(page.getByLabel('What to do?').first()).toHaveValue('Unsaved switch test')
  await expect(page.getByText('All changes saved')).toBeVisible()
})

test('creates a todo by typing in the top composer and removes it when cleared', async ({ page }) => {
  const title = uniqueListTitle('Ghost composer')
  await page.goto('/')
  await waitForApp(page)
  await startTodoList(page, title)

  const composer = page.getByLabel('Add a todo')
  const saved = waitForWrite(page)
  await composer.fill('Typed into ghost')
  await page.getByRole('button', { name: 'Add todo', exact: true }).click()
  await saved
  await expect(page.getByText('All changes saved')).toBeVisible()
  await expect(page.getByLabel('What to do?').first()).toHaveValue('Typed into ghost')

  await page.reload()
  await page.getByText(title, { exact: true }).click()
  await expect(page.getByLabel('What to do?').first()).toHaveValue('Typed into ghost')

  const removed = waitForWrite(page)
  await page.getByLabel('Delete todo: Typed into ghost').click()
  await removed

  await page.reload()
  await page.getByText(title, { exact: true }).click()
  await expect(page.getByLabel('What to do?')).toHaveCount(0)
})

test('commits composer text with Enter', async ({ page }) => {
  const title = uniqueListTitle('Enter commit')
  await page.goto('/')
  await waitForApp(page)
  await startTodoList(page, title)

  const composer = page.getByLabel('Add a todo')
  const saved = waitForWrite(page)
  await composer.fill('Enter to commit')
  await composer.press('Enter')
  await saved

  await expect(page.getByLabel('What to do?').first()).toHaveValue('Enter to commit')
  await expect(composer).toHaveValue('')
  await expect(page.getByText('All changes saved')).toBeVisible()
})

test('creates a Todo List and Todo that survive a reload', async ({ page }) => {
  const title = uniqueListTitle('Created list')
  const todoText = `Created Todo ${title}`
  await page.goto('/')
  await waitForApp(page)

  const saved = waitForWrite(page)
  await startTodoList(page, title)
  await addTodo(page, todoText)
  await saved
  await expect(page.getByText('All changes saved')).toBeVisible()

  await page.reload()
  await page.getByText(title, { exact: true }).click()
  await expect(page.getByLabel('Todo List name')).toHaveValue(title)
  await expect(page.getByLabel('What to do?').first()).toHaveValue(todoText)
})

test('renames a Todo List even when switching before the text settles', async ({ page }) => {
  const original = uniqueListTitle('Rename source')
  const renamed = uniqueListTitle('Renamed list')
  await page.goto('/')
  await waitForApp(page)
  const created = waitForWrite(page)
  await startTodoList(page, original)
  await created

  const renamedWrite = waitForWrite(page)
  await page.getByLabel('Todo List name').fill(renamed)
  await page.getByText(PRIMARY_LIST_TITLE, { exact: true }).click()
  await renamedWrite

  await page.reload()
  await page.getByText(renamed, { exact: true }).click()
  await expect(page.getByLabel('Todo List name')).toHaveValue(renamed)
})

test('drains edits made while offline once the connection returns', async ({ page }) => {
  const title = uniqueListTitle('Offline within a session')
  await page.goto('/')
  await waitForApp(page)
  await startTodoList(page, title)
  await addTodo(page, 'Original text')
  await expect(page.getByText('All changes saved')).toBeVisible()

  await page.route(`${E2E_API_BASE}/**`, (route) => route.abort('internetdisconnected'))
  const textField = page.getByLabel('What to do?').first()
  await textField.fill('Written while offline')
  await textField.press('Enter')
  await expect(page.getByText('Waiting for connection')).toBeVisible()

  await page.unroute(`${E2E_API_BASE}/**`)
  await expect(page.getByText('All changes saved')).toBeVisible({ timeout: OFFLINE_SAVE_TIMEOUT_MS })

  await page.reload()
  await page.getByText(title, { exact: true }).click()
  await expect(page.getByLabel('What to do?').first()).toHaveValue('Written while offline')
})

test('reports a lost connection and disables editing when reloaded offline', async ({ page }) => {
  await page.goto('/')
  await waitForApp(page)

  await page.route(`${E2E_API_BASE}/**`, (route) => route.abort('internetdisconnected'))
  await page.reload()

  await expect(page.getByText('Connection lost')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add Todo List' })).toBeDisabled()
  await expect(page.getByText(PRIMARY_LIST_TITLE, { exact: true })).toHaveCount(0)
})

test('converges two tabs without any interaction in the second', async ({ page, context }) => {
  const title = uniqueListTitle('Two tabs')
  await page.goto('/')
  await waitForApp(page)
  const created = waitForWrite(page)
  await startTodoList(page, title)
  await created

  const other = await context.newPage()
  await other.goto('/')
  await waitForApp(other)
  await other.getByText(title, { exact: true }).click()
  await expect(other.getByLabel('What to do?')).toHaveCount(0)

  const written = waitForWrite(page)
  await addTodo(page, 'Written in the first tab')
  await written

  await expect(other.getByLabel('What to do?').first()).toHaveValue(
    'Written in the first tab'
  )
  await other.close()
})

test('deletes empty lists immediately and confirms deletion of non-empty lists', async ({ page }) => {
  const emptyTitle = uniqueListTitle('Empty delete')
  const populatedTitle = uniqueListTitle('Populated delete')
  await page.goto('/')
  await waitForApp(page)

  let saved = waitForWrite(page)
  await startTodoList(page, emptyTitle)
  await saved
  saved = waitForWrite(page)
  await page.getByRole('button', { name: `Delete Todo List: ${emptyTitle}` }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText(emptyTitle, { exact: true })).toHaveCount(0)
  await saved

  saved = waitForWrite(page)
  await startTodoList(page, populatedTitle)
  await addTodo(page, 'Todo removed with its list')
  await saved

  await page.getByRole('button', {
    name: `Delete Todo List: ${populatedTitle}`,
  }).click()
  const dialog = page.getByRole('dialog', { name: `Delete ${populatedTitle}?` })
  await expect(dialog).toContainText('1 Todo will also disappear.')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(populatedTitle, { exact: true })).toBeVisible()

  await page.getByRole('button', {
    name: `Delete Todo List: ${populatedTitle}`,
  }).click()
  const deleted = waitForWrite(page)
  await page.getByRole('dialog', { name: `Delete ${populatedTitle}?` })
    .getByRole('button', { name: 'Delete Todo List' })
    .click()
  await deleted

  // One datom deletes the whole Todo List: its Todos stop projecting with it.
  await page.reload()
  await expect(page.getByText(populatedTitle, { exact: true })).toHaveCount(0)
})
