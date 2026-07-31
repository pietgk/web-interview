import { test, expect } from '@playwright/test'

const firstListTodo = {
  id: '0000000001-todo-1',
  text: 'First todo of first list!',
  completed: false,
  dueDate: null,
}

async function resetFirstList(request) {
  await request.put('http://localhost:3001/api/todo-lists/0000000001', {
    data: {
      todos: [firstListTodo],
    },
  })
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

test('marks a todo and its list as completed', async ({ page }) => {
  await page.goto('/')
  await page.getByText('First List').click()

  const saved = waitForAutosave(page)
  await page.getByLabel('Mark todo 1 completed').check()
  await saved
  await expect(page.getByLabel('First List completed')).toBeVisible()
  await expect(page.getByText('All todos completed')).toBeVisible()
})

test('shows remaining time for a due date', async ({ page }) => {
  await page.goto('/')
  await page.getByText('First List').click()

  const saved = waitForAutosave(page)
  // Far-future date so the label is stable regardless of "today"
  await page.getByLabel('Due date for todo 1').fill('2099-01-15')
  await expect(page.getByText(/days remaining/)).toBeVisible()
  await saved
  await expect(page.getByText('All changes saved')).toBeVisible()
})
