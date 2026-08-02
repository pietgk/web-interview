import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTodoListActor } from '@web-interview/todos/actor'
import { patchTodoTransaction } from '@web-interview/todos/transactions'
import { createSeedTodoLists } from '../seed.js'
import { JsonlJournalStorage } from './jsonlJournalStorage.js'

const resources = []

const createActorAt = async (filePath) => {
  const storage = new JsonlJournalStorage({
    filePath,
    initialTodoLists: createSeedTodoLists(),
  })
  const actor = createTodoListActor({ storage })
  await actor.start()
  resources.push(actor)
  return actor
}

const temporaryJournal = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'todo-journal-'))
  resources.push({ stop: () => rm(directory, { recursive: true, force: true }) })
  return join(directory, 'todos.jsonl')
}

afterEach(async () => {
  while (resources.length > 0) await resources.pop().stop()
})

describe('JSONL todo journal', () => {
  it('rebuilds the authoritative read model after restart', async () => {
    const filePath = await temporaryJournal()
    const first = await createActorAt(filePath)
    const snapshot = first.getSnapshot()
    const todo = snapshot.readModel['0000000001'].todos[0]
    await first.transact(
      patchTodoTransaction({
        basis: snapshot.basis,
        clientId: 'journal-test',
        listId: '0000000001',
        todo,
        patch: { text: 'Survives restart' },
      })
    )
    await first.stop()
    resources.splice(resources.indexOf(first), 1)

    const restarted = await createActorAt(filePath)

    assert.equal(
      restarted.getSnapshot().readModel['0000000001'].todos[0].text,
      'Survives restart'
    )
    assert.equal(restarted.getSnapshot().basis, 2)
  })

  it('discards a torn final record and keeps earlier transactions', async () => {
    const filePath = await temporaryJournal()
    const first = await createActorAt(filePath)
    await first.stop()
    resources.splice(resources.indexOf(first), 1)
    await appendFile(filePath, '{"version":1,"transaction":')

    const recovered = await createActorAt(filePath)

    assert.equal(Object.keys(recovered.getSnapshot().readModel).length, 2)
    assert.ok((await readFile(filePath, 'utf8')).endsWith('\n'))
  })

  it('fails on corruption before the final record', async () => {
    const filePath = await temporaryJournal()
    await writeFile(
      filePath,
      '{"version":1,"transaction":{},"checksum":"bad"}\n' +
        '{"version":1,"transaction":{},"checksum":"also-bad"}\n'
    )
    const storage = new JsonlJournalStorage({
      filePath,
      initialTodoLists: createSeedTodoLists(),
    })

    await assert.rejects(storage.load(), /corrupt at record 1/)
    await storage.close()
  })
})
