import { fileURLToPath } from 'node:url'
import { datomSchema } from '@web-interview/todos/datom'
import { DatomStore } from '@web-interview/todos/datom-store'
import { createSeedTodoLists, seedDatoms } from '../seed.js'
import { DatomJournal } from './datomJournal.js'

/** @typedef {import('@web-interview/todos/types').Datom} Datom */

export const DEFAULT_DATOM_LOG_PATH = fileURLToPath(
  new URL('../../data/datoms.jsonl', import.meta.url)
)

/**
 * The store plus its durability. Startup replays the journal; every write is
 * journaled before it is applied, and only the winners come back out.
 *
 * @param {object} [options]
 * @param {string} [options.filePath]
 * @param {import('../seed.js').SeedTodoLists} [options.seed]
 * @param {() => number} [options.now]
 * @param {DatomJournal} [options.journal]
 */
export const createDatomService = async ({
  filePath = DEFAULT_DATOM_LOG_PATH,
  seed = createSeedTodoLists(),
  now = () => Date.now(),
  journal = new DatomJournal({ filePath }),
} = {}) => {
  const store = new DatomStore()

  const replayed = await journal.open()
  for (const datom of replayed) store.apply(datom)

  if (replayed.length === 0 && seed.length > 0) {
    const seeded = seedDatoms(seed, now())
    for (const datom of seeded) {
      const parsed = datomSchema.safeParse(datom)
      if (!parsed.success) throw new Error('Seed produced an invalid datom')
    }
    await journal.append(seeded)
    for (const datom of seeded) store.apply(datom)
  }

  return {
    store,
    now,
    /**
     * Journals every datom because the journal is the history, and returns only
     * the winners because no client needs a datom that lost.
     *
     * @param {Datom[]} datoms
     * @returns {Promise<Datom[]>}
     */
    async record(datoms) {
      await journal.append(datoms)
      return datoms.filter((datom) => store.apply(datom))
    },
    close: () => journal.close(),
  }
}
