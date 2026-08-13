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
 */
const PRESENTATIONAL_PRIMITIVES: Record<string, string> = {
  'todos/components/TodoRow.tsx':
    'Layout wrapper only: a role="group" box that places named slots on the ' +
    'shared Todo column grid. It owns no domain state, and its accessible name ' +
    'is supplied by TodoItem and TodoComposer, whose stories cover it.',
}

/** Not components: the DOM entry point and the harness stories themselves use. */
const NOT_COMPONENTS = ['index.tsx', 'testing/storyHarness.tsx']

const tsxFilesUnder = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return tsxFilesUnder(path)
    return entry.name.endsWith('.tsx') && !entry.name.endsWith('.stories.tsx')
      ? [path]
      : []
  })

const components = tsxFilesUnder(SOURCE)
  .map((path) => relative(SOURCE, path))
  .filter((path) => !NOT_COMPONENTS.includes(path))
  .sort()

const hasStory = (path: string) =>
  readdirSync(resolve(SOURCE, dirname(path))).includes(
    `${path.split('/').pop()?.replace(/\.tsx$/, '')}.stories.tsx`
  )

describe('story catalog', () => {
  it('finds components to check', () => {
    expect(components.length).toBeGreaterThan(0)
  })

  it.each(components)('%s is storied or a declared primitive', (path) => {
    if (PRESENTATIONAL_PRIMITIVES[path]) return
    expect(
      hasStory(path),
      `${path} has no .stories.tsx. Add one, or declare it in ` +
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
