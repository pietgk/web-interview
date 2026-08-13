import assert from 'node:assert/strict'
import { access, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import { removeWithheldCombinedExplorer } from './coverage-artifacts.ts'

test('withholding synthetic incompatibility deletes a previously published explorer', async () => {
  const coverageDirectory = await mkdtemp(join(tmpdir(), 'combined-explorer-'))
  await writeFile(join(coverageDirectory, 'index.html'), 'stale explorer')

  await removeWithheldCombinedExplorer({
    coverageDirectory,
    combinedAutomation: {
      status: 'withheld',
      incompatibleFiles: [{ path: 'frontend/src/a.js', reason: 'synthetic incompatibility' }],
      providerIssues: [],
      admissionIssues: [],
    },
  })

  await assert.rejects(access(coverageDirectory))
})
