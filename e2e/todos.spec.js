import { test, expect } from '@playwright/test'

const firstListTodo = {
  id: '0000000001-todo-1',
  text: 'First todo of first list!',
  completed: false,
  dueDate: null,
}

async function resetFirstList(request) {
  const response = await request.put('http://localhost:3001/api/todo-lists/0000000001', {
    data: {
      todos: [firstListTodo],
    },
  })
  expect(response.ok()).toBeTruthy()
}

const waitForAutosave = (page) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      response.url().includes('/api/todo-lists/') &&
      response.ok()
  )

test.beforeEach(async ({ request }) => {
  await resetFirstList(request)
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

  const saved = waitForAutosave(page)
  await page.getByLabel('Mark completed: First todo of first list!').check()
  await saved
  await expect(page.getByText('All todos completed')).toBeVisible()
  await expect(page.getByRole('button', { name: /First List/ })).toHaveAttribute(
    'aria-current',
    'true'
  )

  await page.reload()
  await page.getByText('First List').click()
  await expect(page.getByLabel('Mark completed: First todo of first list!')).toBeChecked()
  await expect(page.getByText('All todos completed')).toBeVisible()
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
