import { test, expect } from '@playwright/test'
import { E2E_API_BASE } from './environment.js'

const firstListTodo = {
  id: '0000000001-todo-1',
  text: 'First todo of first list!',
  completed: false,
  dueDate: null,
}

async function resetFirstList(request) {
  const response = await request.put(`${E2E_API_BASE}/api/todo-lists/0000000001`, {
    headers: {
      'x-client-id': 'playwright-e2e-reset',
    },
    data: {
      todos: [firstListTodo],
    },
  })
  if (!response.ok()) {
    throw new Error(`Failed to reset first list: ${response.status()} ${await response.text()}`)
  }
}

const waitForAutosave = (page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().endsWith('/api/todo-lists/sync') &&
      response.ok()
  )

test.beforeEach(async ({ request }) => {
  await resetFirstList(request)
})

test('rejects a due date that does not exist in its month', async ({ request }) => {
  const response = await request.put(
    `${E2E_API_BASE}/api/todo-lists/0000000001`,
    {
      data: {
        todos: [{ ...firstListTodo, dueDate: '2026-02-29' }],
      },
    }
  )

  expect(response.status()).toBe(400)
  await expect(response.json()).resolves.toMatchObject({
    code: 'VALIDATION_ERROR',
    issues: [
      {
        path: ['todos', 0, 'dueDate'],
        message: 'dueDate must be a real calendar date',
      },
    ],
  })

  const listsResponse = await request.get(`${E2E_API_BASE}/api/todo-lists`)
  expect(listsResponse.ok()).toBe(true)
  const lists = await listsResponse.json()
  expect(lists['0000000001'].todos).toEqual([firstListTodo])
})

test('autosaves todos and persists them across refresh', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('My Todo Lists')).toBeVisible()
  await page.getByText('First List').click()

  const textField = page.getByLabel('What to do?')
  const saved = waitForAutosave(page)
  await textField.fill('Persisted from e2e')
  await saved
  await expect(page.getByText('All changes saved')).toBeVisible()

  await page.reload()
  await page.getByText('First List').click()
  await expect(page.getByLabel('What to do?')).toHaveValue('Persisted from e2e')
})

test('marks a todo and its list as completed and persists after refresh', async ({ page }) => {
  await page.goto('/')
  await page.getByText('First List').click()
  const listButton = page.getByRole('button', { name: /First List/ })
  const initialHeight = (await listButton.boundingBox()).height

  const saved = waitForAutosave(page)
  await page.getByLabel('Mark completed: First todo of first list!').check()
  await saved
  await expect(page.getByText('1 of 1 completed')).toBeVisible()
  const completedHeight = (await listButton.boundingBox()).height
  expect(completedHeight).toBe(initialHeight)
  await expect(page.getByRole('button', { name: /First List/ })).toHaveAttribute(
    'aria-current',
    'true'
  )

  await page.reload()
  await page.getByText('First List').click()
  await expect(page.getByLabel('Mark completed: First todo of first list!')).toBeChecked()
  await expect(page.getByText('1 of 1 completed')).toBeVisible()
})

test('shows a due-in label for a due date and persists after refresh', async ({ page }) => {
  await page.goto('/')
  await page.getByText('First List').click()

  const saved = waitForAutosave(page)
  await page.getByLabel('Due date: First todo of first list!').fill('2099-01-15')
  await expect(
    page.getByLabel(/Due in \d+ years: First todo of first list!/)
  ).toHaveValue('2099-01-15')
  await saved
  await expect(page.getByText('All changes saved')).toBeVisible()

  await page.reload()
  await page.getByText('First List').click()
  await expect(
    page.getByLabel(/Due in \d+ years: First todo of first list!/)
  ).toHaveValue('2099-01-15')
})

test('keeps edits when switching lists before debounce expires', async ({ page }) => {
  await page.goto('/')
  await page.getByText('First List').click()

  const textField = page.getByLabel('What to do?')
  const saved = waitForAutosave(page)
  await textField.fill('Unsaved switch test')
  await page.getByText('Second List').click()
  await saved

  await page.getByText('First List').click()
  await expect(page.getByLabel('What to do?')).toHaveValue('Unsaved switch test')
  await expect(page.getByText('All changes saved')).toBeVisible()
})

test('creates a todo by typing in the top composer and removes it when cleared', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByText('First List').click()

  const composer = page.getByLabel('Add a todo')
  const saved = waitForAutosave(page)
  await composer.fill('Typed into ghost')
  await page.getByRole('button', { name: 'Add todo' }).click()
  await saved
  await expect(page.getByText('All changes saved')).toBeVisible()
  await expect(page.getByLabel('What to do?').first()).toHaveValue('Typed into ghost')

  await page.reload()
  await page.getByText('First List').click()
  await expect(page.getByLabel('What to do?').first()).toHaveValue('Typed into ghost')

  const removed = waitForAutosave(page)
  await page.getByLabel('Delete todo: Typed into ghost').click()
  await removed

  await page.reload()
  await page.getByText('First List').click()
  await expect(page.getByLabel('What to do?')).toHaveValue('First todo of first list!')
})

test('commits composer text with Enter', async ({ page }) => {
  await page.goto('/')
  await page.getByText('First List').click()

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
  await page.getByText('First List').click()
  await page.route(`${E2E_API_BASE}/**`, (route) => route.abort('internetdisconnected'))

  await page.getByLabel('What to do?').fill('Written while offline')
  await expect(page.getByText('Saved offline')).toBeVisible()

  const reloadDialogs = []
  page.on('dialog', async (dialog) => {
    reloadDialogs.push(dialog.type())
    await dialog.accept()
  })
  await page.reload()
  expect(reloadDialogs).toEqual([])
  await page.getByText('First List').click()
  await expect(page.getByLabel('What to do?')).toHaveValue('Written while offline')

  await page.unroute(`${E2E_API_BASE}/**`)
  const synced = waitForAutosave(page)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await synced
  await expect(page.getByText('All changes saved')).toBeVisible()

  await page.reload()
  await page.getByText('First List').click()
  await expect(page.getByLabel('What to do?')).toHaveValue('Written while offline')
})
