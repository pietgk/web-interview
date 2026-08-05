import { readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Components with no story are proven by nothing: no play function, and no axe
 * pass of their own. `TodoRow` lost its story in one commit and every gate
 * stayed green, which is exactly the silent loss this test exists to stop.
 *
 * A component may be absent from the catalog only by being named here, with the
 * reason. That keeps a deliberate choice visible and a careless one loud.
 *
 * @type {Record<string, string>}
 */
const PRESENTATIONAL_PRIMITIVES = {
  'todos/components/TodoRow.jsx':
    'Layout wrapper only: a role="group" div with flex styles and children. It ' +
    'owns no domain state, and its accessible name is supplied by TodoItem and ' +
    'TodoComposer, whose stories cover it.',
}

/** Not components: the DOM entry point and the harness stories themselves use. */
const NOT_COMPONENTS = ['index.jsx', 'testing/storyHarness.jsx']

/** @param {string} directory @returns {string[]} */
const jsxFilesUnder = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return jsxFilesUnder(path)
    return entry.name.endsWith('.jsx') && !entry.name.endsWith('.stories.jsx')
      ? [path]
      : []
  })

const components = jsxFilesUnder(SOURCE)
  .map((path) => relative(SOURCE, path))
  .filter((path) => !NOT_COMPONENTS.includes(path))
  .sort()

/** @param {string} path */
const hasStory = (path) =>
  readdirSync(resolve(SOURCE, dirname(path))).includes(
    `${path.split('/').pop()?.replace(/\.jsx$/, '')}.stories.jsx`
  )

describe('story catalog', () => {
  it('finds components to check', () => {
    expect(components.length).toBeGreaterThan(0)
  })

  it.each(components)('%s is storied or a declared primitive', (path) => {
    if (PRESENTATIONAL_PRIMITIVES[path]) return
    expect(
      hasStory(path),
      `${path} has no .stories.jsx. Add one, or declare it in ` +
        'PRESENTATIONAL_PRIMITIVES with the reason it owns no user-visible state.'
    ).toBe(true)
  })

  it('has no stale primitive exemptions', () => {
    const stale = Object.keys(PRESENTATIONAL_PRIMITIVES).filter(
      (path) => !components.includes(path)
    )
    expect(stale, 'exemptions for files that no longer exist').toEqual([])
  })

  it('does not exempt a component that has a story anyway', () => {
    const redundant = Object.keys(PRESENTATIONAL_PRIMITIVES).filter(hasStory)
    expect(redundant, 'exempted but storied; drop the exemption').toEqual([])
  })
})
