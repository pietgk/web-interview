import { datomSchema } from '@web-interview/todos/datom'
import { DatomStore } from '@web-interview/todos/datom-store'
import { createSeedTodoLists, seedDatoms } from '../seed.ts'
import type { SeedTodoLists } from '../seed.ts'
import { DEFAULT_DATOM_LOG_PATH } from '../dataPaths.ts'
import { DatomJournal } from './datomJournal.ts'
import type { Datom } from '@web-interview/todos/types'

/**
 * The store plus its durability. Startup replays the journal; every write is
 * journaled before it is applied, and only the winners come back out.
 */
export const createDatomService = async ({
  filePath = DEFAULT_DATOM_LOG_PATH,
  seed = createSeedTodoLists(),
  now = () => Date.now(),
  journal = new DatomJournal({ filePath }),
  buildSeed = seedDatoms,
}: {
  filePath?: string | undefined
  seed?: SeedTodoLists | undefined
  now?: () => number
  journal?: DatomJournal
  buildSeed?: (todoLists: SeedTodoLists, seededAt: number) => Datom[]
} = {}) => {
  const store = new DatomStore()

  const replayed = await journal.open()
  for (const datom of replayed) store.apply(datom)

  if (replayed.length === 0 && seed.length > 0) {
    const seeded = buildSeed(seed, now())
    for (const datom of seeded) {
      const parsed = datomSchema.safeParse(datom)
      if (!parsed.success) throw new Error('Seed produced an invalid datom')
    }
    await journal.append(seeded)
    for (const datom of seeded) store.apply(datom)
    replayed.push(...seeded)
  }

  /**
   * The log is identified by its own first datom, so the epoch needs no separate
   * storage and survives restarts for free. Recovery only ever truncates the last
   * line, so the first one is stable; a wiped journal gets a new first datom and
   * therefore a new epoch.
   */
  let epoch: string | null = replayed[0]?.[3] ?? null

  return {
    store,
    now,
    get epoch() {
      return epoch
    },
    /**
     * Journals every datom because the journal is the history, and returns only
     * the winners because no client needs a datom that lost.
     */
    async record(datoms: Datom[]): Promise<Datom[]> {
      await journal.append(datoms)
      // An unseeded server has no epoch until something is written to it.
      epoch ??= datoms[0]?.[3] ?? null
      return datoms.filter((datom) => store.apply(datom))
    },
    close: () => journal.close(),
  }
}

export type DatomService = Awaited<ReturnType<typeof createDatomService>>
