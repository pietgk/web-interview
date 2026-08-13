import { afterEach, beforeEach, describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDatomService } from './datomService.ts'

const SEED = [{ title: 'First List', todos: [] }]

describe('datom service seeding', () => {
  let directory: string
  let filePath: string

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
          buildSeed: () => [['not-a-datom']] as never,
        }),
      /Seed produced an invalid datom/
    )
  })
})
