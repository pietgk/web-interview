import { afterEach, beforeEach, describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ATTRIBUTE } from '@web-interview/todos/datom'
import { DatomStore } from '@web-interview/todos/datom-store'
import { listId, todoId, ulid, ulidTime } from '@web-interview/todos/ulid'
import { DatomJournal } from './datomJournal.ts'
import { createDatomService } from './datomService.ts'
import type { Datom } from '@web-interview/todos/types'

const REPLAYED_DUE_DAY = '2026-08-03'

const SEED = [{ title: 'First List', todos: [{ text: 'First todo', completed: false, dueDate: null }] }]

describe('datom journal', () => {
  let directory: string
  let filePath: string
  let clock: number

  const nextTimestamp = () => (clock += 1)

  beforeEach(async () => {
    // The ULID generator is monotonic for the whole process, so a fake clock that
    // started behind it would silently mint future-dated ids.
    clock = ulidTime(ulid(0)) + 1_000
    directory = await mkdtemp(join(tmpdir(), 'datom-journal-'))
    filePath = join(directory, 'datoms.jsonl')
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('reproduces the read model exactly when the journal is replayed', async () => {
    const first = await createDatomService({ filePath, seed: SEED, now: nextTimestamp })
    const list = Object.keys(first.store.readModel())[0]
    const todo = todoId(list, nextTimestamp())
    await first.record([
      [todo, ATTRIBUTE.TEXT, 'Written before the restart', ulid(nextTimestamp()), true],
      [todo, ATTRIBUTE.DUE_DATE, REPLAYED_DUE_DAY, ulid(nextTimestamp()), true],
      [list, ATTRIBUTE.TITLE, 'Renamed before the restart', ulid(nextTimestamp()), true],
    ])
    const before = first.store.readModel()
    await first.close()

    const restarted = await createDatomService({ filePath, seed: SEED, now: nextTimestamp })
    try {
      assert.deepEqual(restarted.store.readModel(), before)
    } finally {
      await restarted.close()
    }
  })

  it('discards an unterminated final line on recovery', async () => {
    const service = await createDatomService({ filePath, seed: SEED, now: nextTimestamp })
    const list = Object.keys(service.store.readModel())[0]
    await service.record([[list, ATTRIBUTE.TITLE, 'Durable', ulid(nextTimestamp()), true]])
    await service.close()
    await appendFile(filePath, `["${list}","${ATTRIBUTE.TITLE}","Torn`, 'utf8')

    const recovered = await createDatomService({ filePath, seed: SEED, now: nextTimestamp })
    try {
      assert.equal(recovered.store.readModel()[list].title, 'Durable')
      assert.doesNotMatch(await readFile(filePath, 'utf8'), /Torn/)
    } finally {
      await recovered.close()
    }
  })

  it('discards an unparseable final line on recovery', async () => {
    const service = await createDatomService({ filePath, seed: SEED, now: nextTimestamp })
    const list = Object.keys(service.store.readModel())[0]
    await service.record([[list, ATTRIBUTE.TITLE, 'Durable', ulid(nextTimestamp()), true]])
    await service.close()
    await appendFile(filePath, '["not","a","datom"]\n', 'utf8')

    const recovered = await createDatomService({ filePath, seed: SEED, now: nextTimestamp })
    try {
      assert.equal(recovered.store.readModel()[list].title, 'Durable')
    } finally {
      await recovered.close()
    }
  })

  it('fails startup on an unparseable earlier line', async () => {
    const list = listId(nextTimestamp())
    await writeFile(
      filePath,
      [
        '{ not json at all',
        JSON.stringify([list, ATTRIBUTE.TITLE, 'Later', ulid(nextTimestamp()), true]),
        '',
      ].join('\n'),
      'utf8'
    )

    await assert.rejects(
      createDatomService({ filePath, seed: SEED, now: nextTimestamp }),
      /Datom journal is corrupt at line 1/
    )
  })

  it('journals the losers too, because the journal is the history', async () => {
    const service = await createDatomService({ filePath, seed: SEED, now: nextTimestamp })
    const list = Object.keys(service.store.readModel())[0]
    const loser = ulid(nextTimestamp())
    const winner = ulid(nextTimestamp())

    const winners = await service.record([
      [list, ATTRIBUTE.TITLE, 'Winner', winner, true] as Datom,
      [list, ATTRIBUTE.TITLE, 'Loser', loser, true] as Datom,
    ])
    await service.close()

    assert.deepEqual(winners.map(([, , value]) => value), ['Winner'])
    const journaled = (await readFile(filePath, 'utf8')).trim().split('\n')
    assert.equal(journaled.filter((line) => line.includes('Loser')).length, 1)
  })

  it('keeps its epoch across a restart, and takes a new one when the journal is wiped', async () => {
    const first = await createDatomService({ filePath, seed: SEED, now: nextTimestamp })
    const original = first.epoch
    await first.close()

    const restarted = await createDatomService({ filePath, seed: SEED, now: nextTimestamp })
    const afterRestart = restarted.epoch
    await restarted.close()

    await rm(filePath)
    const wiped = await createDatomService({ filePath, seed: SEED, now: nextTimestamp })
    try {
      assert.ok(original, 'a seeded journal has an epoch')
      assert.equal(afterRestart, original, 'the same journal is the same log')
      assert.notEqual(wiped.epoch, original, 'a wiped journal is a different log')
    } finally {
      await wiped.close()
    }
  })

  it('has no epoch until an unseeded server is first written to', async () => {
    const service = await createDatomService({ filePath, seed: [], now: nextTimestamp })
    try {
      assert.equal(service.epoch, null)

      const list = listId(nextTimestamp())
      const first = ulid(nextTimestamp())
      await service.record([[list, ATTRIBUTE.TITLE, 'First ever write', first, true]])
      assert.equal(service.epoch, first)

      await service.record([[list, ATTRIBUTE.TITLE, 'Renamed', ulid(nextTimestamp()), true]])
      assert.equal(service.epoch, first, 'the epoch is the first datom, not the latest')
    } finally {
      await service.close()
    }
  })

  it('starts empty when the journal is empty and nothing is seeded', async () => {
    const journal = new DatomJournal({ filePath })
    assert.deepEqual(await journal.open(), [])
    await journal.close()

    const service = await createDatomService({ filePath, seed: [], now: nextTimestamp })
    try {
      assert.deepEqual(service.store.readModel(), new DatomStore().readModel())
    } finally {
      await service.close()
    }
  })
})
