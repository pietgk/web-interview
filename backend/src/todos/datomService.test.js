import { afterEach, beforeEach, describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDatomService } from './datomService.js'

const SEED = [{ title: 'First List', todos: [] }]

describe('datom service seeding', () => {
  /** @type {string} */
  let directory
  /** @type {string} */
  let filePath

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'datom-service-'))
    filePath = join(directory, 'datoms.jsonl')
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('refuses to start when the seed builder emits an invalid datom', async () => {
    await assert.rejects(
      () =>
        createDatomService({
          filePath,
          seed: SEED,
          buildSeed: () => /** @type {never} */ ([['not-a-datom']]),
        }),
      /Seed produced an invalid datom/
    )
  })
})
