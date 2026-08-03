import { test, expect } from '@playwright/test'
import { constants as HTTP } from 'node:http2'
import { ERROR_CODE, TODO_API_PATH } from '@web-interview/todos/protocol'
import {
  createTodoListAtBottomTransaction,
  createTodoTransaction,
  deleteTodoListTransaction,
  deleteTodoTransaction,
  patchTodoTransaction,
} from '@web-interview/todos/transactions'
import { E2E_API_BASE } from './environment.js'
import {
  PRIMARY_LIST_ID,
  PRIMARY_LIST_TITLE,
  PRIMARY_TODO,
  SECONDARY_LIST_TITLE,
} from './fixture.js'

const E2E_RESET_CLIENT_ID = 'playwright-e2e-reset'

const primaryListName = new RegExp(`^${PRIMARY_LIST_TITLE} `)
const dueInYearsLabel = new RegExp(
  `Due in \\d+ years: ${PRIMARY_TODO.text}`
)

/** @param {string} prefix */
const uniqueListTitle = (prefix) =>
  `${prefix} ${Date.now()} ${Math.random().toString(16).slice(2)}`

/** @param {import('@playwright/test').Page} page @param {string} title */
async function startTodoList(page, title) {
  await page.getByRole('button', { name: 'Add Todo List' }).click()
  const titleField = page.getByLabel('Todo List name')
  await expect(titleField).toBeFocused()
  await titleField.fill(title)
  await expect(page.getByLabel('Add a todo')).toBeVisible()
}

/**
 * @param {import('@playwright/test').APIRequestContext} request
 * @returns {Promise<{basis: number, todoLists: import('@web-interview/todos/types').TodoLists}>}
 */
async function fetchReadModel(request) {
  const response = await request.get(`${E2E_API_BASE}${TODO_API_PATH.READ_MODEL}`)
  if (!response.ok()) {
    throw new Error(
      `Failed to load read model: ${response.status()} ${await response.text()}`
    )
  }
  return response.json()
}

/**
 * Soft-delete the seeded primary list (UI-style) and recreate it from the e2e
 * fixture via POST /sync. Todos are tombstoned first so resurrecting the same
 * list id does not bring dirty todos back. Journal history is retained.
 *
 * @param {import('@playwright/test').APIRequestContext} request
 */
async function resetFirstList(request) {
  const { basis, todoLists } = await fetchReadModel(request)
  const primary = todoLists[PRIMARY_LIST_ID]
  const alreadySeeded =
    primary?.title === PRIMARY_LIST_TITLE &&
    primary.todos.length === 1 &&
    primary.todos[0].id === PRIMARY_TODO.id &&
    primary.todos[0].text === PRIMARY_TODO.text &&
    primary.todos[0].completed === PRIMARY_TODO.completed &&
    primary.todos[0].dueDate === PRIMARY_TODO.dueDate

  if (alreadySeeded) return

  /** @type {import('@web-interview/todos/types').Transaction[]} */
  const transactions = []

  if (primary) {
    for (const todo of primary.todos) {
      transactions.push(
        deleteTodoTransaction({
          basis,
          clientId: E2E_RESET_CLIENT_ID,
          listId: primary.id,
          todo,
        })
      )
    }
    transactions.push(
      deleteTodoListTransaction({
        basis,
        clientId: E2E_RESET_CLIENT_ID,
        todoList: primary,
      })
    )
  }

  transactions.push(
    createTodoListAtBottomTransaction({
      basis,
      clientId: E2E_RESET_CLIENT_ID,
      listId: PRIMARY_LIST_ID,
      title: PRIMARY_LIST_TITLE,
    }),
    createTodoTransaction({
      basis,
      clientId: E2E_RESET_CLIENT_ID,
      listId: PRIMARY_LIST_ID,
      todo: { ...PRIMARY_TODO },
    })
  )

  const response = await request.post(`${E2E_API_BASE}${TODO_API_PATH.SYNC}`, {
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': E2E_RESET_CLIENT_ID,
    },
    data: { basis, transactions },
  })
  if (!response.ok()) {
    throw new Error(
      `Failed to reset first list: ${response.status()} ${await response.text()}`
    )
  }

  const body = await response.json()
  if (body.rejectedTransactions?.length) {
    throw new Error(
      `Failed to reset first list: ${JSON.stringify(body.rejectedTransactions)}`
    )
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
  const { basis, todoLists } = await fetchReadModel(request)
  const todo = todoLists[PRIMARY_LIST_ID].todos[0]
  const transaction = patchTodoTransaction({
    basis,
    clientId: E2E_RESET_CLIENT_ID,
    listId: PRIMARY_LIST_ID,
    todo,
    patch: { dueDate: '2026-02-29' },
  })
  expect(transaction).not.toBeNull()

  const response = await request.post(`${E2E_API_BASE}${TODO_API_PATH.SYNC}`, {
    headers: { 'Content-Type': 'application/json' },
    data: { basis, transactions: [transaction] },
  })

  expect(response.status()).toBe(HTTP.HTTP_STATUS_BAD_REQUEST)
  await expect(response.json()).resolves.toMatchObject({
    code: ERROR_CODE.VALIDATION,
    issues: [
      expect.objectContaining({
        message: expect.stringMatching(/Invalid value for todo\/dueDate/),
      }),
    ],
  })

  const { todoLists: lists } = await fetchReadModel(request)
  expect(lists[PRIMARY_LIST_ID].todos).toEqual([PRIMARY_TODO])
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
  await page.waitForTimeout(50)

  const shiftedLabels = await page.evaluate(
    (key) => Reflect.get(globalThis, key),
    layoutShiftLabelsKey
  )
  expect(shiftedLabels).not.toContain('Add Todo List')
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
  await page.getByRole('button', { name: 'Add todo', exact: true }).click()
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
  await expect(page.getByText('Waiting for connection')).toBeVisible()

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

test('creates a Todo List and Todo that survive synchronization and reload', async ({ page }) => {
  const title = uniqueListTitle('Created list')
  const todoText = `Created Todo ${title}`
  await page.goto('/')

  const saved = waitForAutosave(page)
  await startTodoList(page, title)
  await page.getByLabel('Add a todo').fill(todoText)
  await page.getByLabel('Add a todo').press('Enter')
  await saved
  await expect(page.getByText('All changes saved')).toBeVisible()

  await page.reload()
  await page.getByText(title, { exact: true }).click()
  await expect(page.getByLabel('Todo List name')).toHaveValue(title)
  await expect(page.getByLabel('What to do?').first()).toHaveValue(todoText)
})

test('renames a Todo List even when switching before the debounce expires', async ({ page }) => {
  const original = uniqueListTitle('Rename source')
  const renamed = uniqueListTitle('Renamed list')
  await page.goto('/')
  const created = waitForAutosave(page)
  await startTodoList(page, original)
  await created

  const renamedSync = waitForAutosave(page)
  await page.getByLabel('Todo List name').fill(renamed)
  await page.getByText(PRIMARY_LIST_TITLE, { exact: true }).click()
  await renamedSync

  await page.reload()
  await page.getByText(renamed, { exact: true }).click()
  await expect(page.getByLabel('Todo List name')).toHaveValue(renamed)
})

test('creates a Todo List offline, restores it from IndexedDB, and synchronizes on reconnect', async ({ page }) => {
  const title = uniqueListTitle('Offline list')
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Add Todo List' })).toBeEnabled()
  await page.route(`${E2E_API_BASE}/**`, (route) => route.abort('internetdisconnected'))

  await startTodoList(page, title)
  await expect(page.getByText('Waiting for connection')).toBeVisible()
  await page.reload()
  await expect(page.getByText(title, { exact: true })).toBeVisible()

  await page.unroute(`${E2E_API_BASE}/**`)
  const synchronized = waitForAutosave(page)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await synchronized
  await expect(page.getByText('All changes saved')).toBeVisible()

  await page.reload()
  await expect(page.getByText(title, { exact: true })).toBeVisible()
})

test('deletes empty lists immediately and confirms deletion of non-empty lists', async ({ page }) => {
  const emptyTitle = uniqueListTitle('Empty delete')
  const populatedTitle = uniqueListTitle('Populated delete')
  await page.goto('/')

  let saved = waitForAutosave(page)
  await startTodoList(page, emptyTitle)
  await saved
  saved = waitForAutosave(page)
  await page.getByRole('button', { name: `Delete Todo List: ${emptyTitle}` }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText(emptyTitle, { exact: true })).toHaveCount(0)
  await saved

  saved = waitForAutosave(page)
  await startTodoList(page, populatedTitle)
  await page.getByLabel('Add a todo').fill('Todo removed with its list')
  await page.getByLabel('Add a todo').press('Enter')
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
  const deleted = waitForAutosave(page)
  await page.getByRole('dialog', { name: `Delete ${populatedTitle}?` })
    .getByRole('button', { name: 'Delete Todo List' })
    .click()
  await deleted
  await page.reload()
  await expect(page.getByText(populatedTitle, { exact: true })).toHaveCount(0)
})
