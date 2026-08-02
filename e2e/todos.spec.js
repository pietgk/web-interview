import { test, expect } from '@playwright/test'
import { constants as HTTP } from 'node:http2'
import {
  ERROR_CODE,
  TODO_API_PATH,
  todoListPath,
} from '@web-interview/todos/protocol'
import { E2E_API_BASE } from './environment.js'
import {
  PRIMARY_LIST_ID,
  PRIMARY_LIST_TITLE,
  PRIMARY_TODO,
  SECONDARY_LIST_TITLE,
} from './fixture.js'

const primaryListName = new RegExp(PRIMARY_LIST_TITLE)
const dueInYearsLabel = new RegExp(
  `Due in \\d+ years: ${PRIMARY_TODO.text}`
)

/** @param {import('@playwright/test').APIRequestContext} request */
async function resetFirstList(request) {
  const response = await request.put(`${E2E_API_BASE}${todoListPath(PRIMARY_LIST_ID)}`, {
    headers: {
      'x-client-id': 'playwright-e2e-reset',
    },
    data: {
      todos: [PRIMARY_TODO],
    },
  })
  if (!response.ok()) {
    throw new Error(`Failed to reset first list: ${response.status()} ${await response.text()}`)
  }
}

/** @param {import('@playwright/test').Page} page */
const waitForAutosave = (page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().endsWith(TODO_API_PATH.SYNC) &&
      response.ok()
  )

/** @param {import('@playwright/test').Locator} locator */
const elementHeight = async (locator) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Expected the todo-list button to have a bounding box')
  return box.height
}

test.beforeEach(async ({ request }) => {
  await resetFirstList(request)
})

test('rejects a due date that does not exist in its month', async ({ request }) => {
  const response = await request.put(
    `${E2E_API_BASE}${todoListPath(PRIMARY_LIST_ID)}`,
    {
      data: {
        todos: [{ ...PRIMARY_TODO, dueDate: '2026-02-29' }],
      },
    }
  )

  expect(response.status()).toBe(HTTP.HTTP_STATUS_BAD_REQUEST)
  await expect(response.json()).resolves.toMatchObject({
    code: ERROR_CODE.VALIDATION,
    issues: [
      {
        path: ['todos', 0, 'dueDate'],
        message: 'dueDate must be a real calendar date',
      },
    ],
  })

  const listsResponse = await request.get(`${E2E_API_BASE}${TODO_API_PATH.ROOT}`)
  expect(listsResponse.ok()).toBe(true)
  const lists = await listsResponse.json()
  expect(lists[PRIMARY_LIST_ID].todos).toEqual([PRIMARY_TODO])
})

test('autosaves todos and persists them across refresh', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('My Todo Lists')).toBeVisible()
  await page.getByText(PRIMARY_LIST_TITLE).click()

  const textField = page.getByLabel('What to do?')
  const saved = waitForAutosave(page)
  await textField.fill('Persisted from e2e')
  await saved
  await expect(page.getByText('All changes saved')).toBeVisible()

  await page.reload()
  await page.getByText(PRIMARY_LIST_TITLE).click()
  await expect(page.getByLabel('What to do?')).toHaveValue('Persisted from e2e')
})

test('marks a todo and its list as completed and persists after refresh', async ({ page }) => {
  await page.goto('/')
  await page.getByText(PRIMARY_LIST_TITLE).click()
  const listButton = page.getByRole('button', { name: primaryListName })
  const initialHeight = await elementHeight(listButton)

  const saved = waitForAutosave(page)
  await page.getByLabel(`Mark completed: ${PRIMARY_TODO.text}`).check()
  await saved
  await expect(page.getByText('1 of 1 completed')).toBeVisible()
  const completedHeight = await elementHeight(listButton)
  expect(completedHeight).toBe(initialHeight)
  await expect(page.getByRole('button', { name: primaryListName })).toHaveAttribute(
    'aria-current',
    'true'
  )

  await page.reload()
  await page.getByText(PRIMARY_LIST_TITLE).click()
  await expect(page.getByLabel(`Mark completed: ${PRIMARY_TODO.text}`)).toBeChecked()
  await expect(page.getByText('1 of 1 completed')).toBeVisible()
})

test('shows a due-in label for a due date and persists after refresh', async ({ page }) => {
  await page.goto('/')
  await page.getByText(PRIMARY_LIST_TITLE).click()

  const saved = waitForAutosave(page)
  await page.getByLabel(`Due date: ${PRIMARY_TODO.text}`).fill('2099-01-15')
  await expect(
    page.getByLabel(dueInYearsLabel)
  ).toHaveValue('2099-01-15')
  await saved
  await expect(page.getByText('All changes saved')).toBeVisible()

  await page.reload()
  await page.getByText(PRIMARY_LIST_TITLE).click()
  await expect(
    page.getByLabel(dueInYearsLabel)
  ).toHaveValue('2099-01-15')
})

test('keeps edits when switching lists before debounce expires', async ({ page }) => {
  await page.goto('/')
  await page.getByText(PRIMARY_LIST_TITLE).click()

  const textField = page.getByLabel('What to do?')
  const saved = waitForAutosave(page)
  await textField.fill('Unsaved switch test')
  await page.getByText(SECONDARY_LIST_TITLE).click()
  await saved

  await page.getByText(PRIMARY_LIST_TITLE).click()
  await expect(page.getByLabel('What to do?')).toHaveValue('Unsaved switch test')
  await expect(page.getByText('All changes saved')).toBeVisible()
})

test('creates a todo by typing in the top composer and removes it when cleared', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByText(PRIMARY_LIST_TITLE).click()

  const composer = page.getByLabel('Add a todo')
  const saved = waitForAutosave(page)
  await composer.fill('Typed into ghost')
  await page.getByRole('button', { name: 'Add todo' }).click()
  await saved
  await expect(page.getByText('All changes saved')).toBeVisible()
  await expect(page.getByLabel('What to do?').first()).toHaveValue('Typed into ghost')

  await page.reload()
  await page.getByText(PRIMARY_LIST_TITLE).click()
  await expect(page.getByLabel('What to do?').first()).toHaveValue('Typed into ghost')

  const removed = waitForAutosave(page)
  await page.getByLabel('Delete todo: Typed into ghost').click()
  await removed

  await page.reload()
  await page.getByText(PRIMARY_LIST_TITLE).click()
  await expect(page.getByLabel('What to do?')).toHaveValue(PRIMARY_TODO.text)
})

test('commits composer text with Enter', async ({ page }) => {
  await page.goto('/')
  await page.getByText(PRIMARY_LIST_TITLE).click()

  const composer = page.getByLabel('Add a todo')
  const saved = waitForAutosave(page)
  await composer.fill('Enter to commit')
  await composer.press('Enter')
  await saved

  await expect(page.getByLabel('What to do?').first()).toHaveValue('Enter to commit')
  await expect(composer).toHaveValue('')
  await expect(page.getByText('All changes saved')).toBeVisible()
})

test('keeps a durable outbox across reload and syncs after reconnecting', async ({ page }) => {
  await page.goto('/')
  await page.getByText(PRIMARY_LIST_TITLE).click()
  await page.route(`${E2E_API_BASE}/**`, (route) => route.abort('internetdisconnected'))

  await page.getByLabel('What to do?').fill('Written while offline')
  await expect(page.getByText('Saved offline')).toBeVisible()

  /** @type {string[]} */
  const reloadDialogs = []
  page.on('dialog', async (dialog) => {
    reloadDialogs.push(dialog.type())
    await dialog.accept()
  })
  await page.reload()
  expect(reloadDialogs).toEqual([])
  await page.getByText(PRIMARY_LIST_TITLE).click()
  await expect(page.getByLabel('What to do?')).toHaveValue('Written while offline')

  await page.unroute(`${E2E_API_BASE}/**`)
  const synced = waitForAutosave(page)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await synced
  await expect(page.getByText('All changes saved')).toBeVisible()

  await page.reload()
  await page.getByText(PRIMARY_LIST_TITLE).click()
  await expect(page.getByLabel('What to do?')).toHaveValue('Written while offline')
})
