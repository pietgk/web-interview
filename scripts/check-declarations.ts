import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const declarationDirectory = resolve('shared/dist/types')
const declarationFiles = (await readdir(declarationDirectory)).filter((file) =>
  file.endsWith('.d.ts')
)

const problems = []
const expectedDeclarations = [
  'datom.d.ts',
  'datomStore.d.ts',
  'todoProtocol.d.ts',
  'selectors.d.ts',
  'types.d.ts',
  'ulid.d.ts',
]

for (const expected of expectedDeclarations) {
  if (!declarationFiles.includes(expected)) {
    problems.push(`${expected}: declaration was not emitted`)
  }
}

for (const file of declarationFiles) {
  if (file.endsWith('.test.d.ts')) {
    problems.push(`${file}: test declaration was emitted`)
  }

  const source = await readFile(resolve(declarationDirectory, file), 'utf8')
  if (/\bany\b/.test(source)) {
    problems.push(`${file}: contains an explicit any type`)
  }
}

if (problems.length > 0) {
  throw new Error(`Invalid shared declarations:\n${problems.join('\n')}`)
}
