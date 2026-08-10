import { test, expect } from '@playwright/test'
import { PRIMARY_LIST_TITLE, PRIMARY_TODO_TEXT } from './fixture.js'

/**
 * Floor for a resting outline alpha under `prefers-contrast: more`. Default
 * MUI / `theme.todos.control.borderOpacity` is 0.23; contrast-more tokens sit
 * well above this so the smoke fails if the media query never applies.
 */
const MIN_MORE_CONTRAST_BORDER_ALPHA = 0.45


/**
 * OS media-preference smokes for the A+B prefs program (see
 * docs/plans/a11y-os-prefs-and-mui-platform.md). Thin on purpose — component
 * catalogs stay in Storybook.
 */

/** @param {string} prefix */
const uniqueListTitle = (prefix) =>
  `${prefix} ${Date.now()} ${Math.random().toString(16).slice(2)}`

/** @param {import('@playwright/test').Page} page */
const waitForApp = async (page) => {
  await expect(page.getByRole('button', { name: 'Add Todo List' })).toBeEnabled()
}

test('delete confirmation opens without transition delay under reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await waitForApp(page)

  const title = uniqueListTitle('Reduced motion')
  await page.getByRole('button', { name: 'Add Todo List' }).click()
  const titleField = page.getByLabel('Todo List name')
  await titleField.fill(title)
  await titleField.press('Enter')
  await page.getByLabel('Add a todo').fill('Keep the list populated')
  await page.getByLabel('Add a todo').press('Enter')
  await expect(page.getByLabel('What to do?').first()).toHaveValue(
    'Keep the list populated'
  )

  await page.getByRole('button', { name: `Delete Todo List: ${title}` }).click()
  const dialog = page.getByRole('dialog', { name: `Delete ${title}?` })
  await expect(dialog).toBeVisible()

  const paperTransition = await dialog.evaluate((node) => {
    const paper =
      node instanceof HTMLElement && node.classList.contains('MuiDialog-paper')
        ? node
        : node.querySelector('.MuiDialog-paper')
    if (!(paper instanceof HTMLElement)) {
      throw new Error('Expected MUI dialog paper')
    }
    return getComputedStyle(paper).transitionDuration
  })
  expect(paperTransition.split(',').every((part) => part.trim() === '0s')).toBe(
    true
  )
})

test('selected Todo List stays painted under forced colors', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' })
  await page.goto('/')
  await waitForApp(page)

  const selected = page.getByRole('button', { name: new RegExp(`^${PRIMARY_LIST_TITLE} `) })
  await expect(selected).toHaveAttribute('aria-current', 'true')

  const paint = await selected.evaluate((node) => {
    const style = getComputedStyle(node)
    return {
      color: style.color,
      backgroundColor: style.backgroundColor,
      forcedColorAdjust: style.forcedColorAdjust,
    }
  })

  // enhanceHighContrast opts selected list rows out of automatic remapping so
  // SelectedItem / SelectedItemText system colors can stick.
  expect(paint.forcedColorAdjust).toBe('none')
  expect(paint.color).not.toBe('rgba(0, 0, 0, 0)')
  expect(paint.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
})

test('completion outline strengthens under prefers-contrast more', async ({
  page,
}) => {
  await page.emulateMedia({ contrast: 'more' })
  await page.goto('/')
  await waitForApp(page)

  const done = page.getByLabel(`Mark completed: ${PRIMARY_TODO_TEXT}`)
  await expect(done).toBeVisible()

  const borderAlpha = await done.evaluate((input) => {
    const field = input.closest('.MuiFormControl-root')
    if (!(field instanceof HTMLElement)) {
      throw new Error('Expected CompletionField FormControl')
    }
    const color = getComputedStyle(field).borderColor
    const match = color.match(
      /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/
    )
    if (!match) {
      throw new Error(`Unexpected borderColor: ${color}`)
    }
    return match[4] === undefined ? 1 : Number(match[4])
  })

  expect(borderAlpha).toBeGreaterThanOrEqual(MIN_MORE_CONTRAST_BORDER_ALPHA)
})
