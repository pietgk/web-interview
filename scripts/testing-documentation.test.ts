import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'vitest'
import { CATEGORIES } from './source-evidence.ts'
import { ROOT, STAGES } from './stages.ts'

test('testing overview names the current verification structure', async () => {
  const overview = await readFile(resolve(ROOT, 'docs/testing-and-validation.md'), 'utf8')
  const expectedNames = [
    ...STAGES.flatMap(({ name, steps }) => [name, ...steps.map(({ name: stepName }) => stepName)]),
    ...CATEGORIES,
  ]

  for (const name of expectedNames) {
    if (!overview.includes(name)) throw new Error(`Overview is missing current verification name: ${name}`)
  }
})
