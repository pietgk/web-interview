import { createHash } from 'node:crypto'
import { mkdir, open, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  applyTransaction,
  createEmptyDatabase,
  projectTodoLists,
  replayTransactions,
  transactionSchema,
} from '@web-interview/todos/database'
import { seedTransactionFromTodoLists } from '@web-interview/todos/transactions'

/** @typedef {import('node:fs/promises').FileHandle} FileHandle */
/** @typedef {import('@web-interview/todos/types').TodoLists} TodoLists */
/** @typedef {import('@web-interview/todos/types').Transaction} Transaction */

const RECORD_VERSION = 1

/** @param {unknown} transaction */
const checksum = (transaction) =>
  createHash('sha256').update(JSON.stringify(transaction)).digest('hex')

/** @param {Transaction} transaction */
const encodeRecord = (transaction) =>
  Buffer.from(
    `${JSON.stringify({
      version: RECORD_VERSION,
      transaction,
      checksum: checksum(transaction),
    })}\n`,
    'utf8'
  )

/**
 * @param {Buffer} buffer
 * @returns {Transaction}
 */
const parseRecord = (buffer) => {
  const decoded = /** @type {unknown} */ (JSON.parse(buffer.toString('utf8')))
  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    !('version' in decoded) ||
    !('transaction' in decoded) ||
    !('checksum' in decoded) ||
    decoded.version !== RECORD_VERSION ||
    typeof decoded.checksum !== 'string' ||
    decoded.checksum !== checksum(decoded.transaction)
  ) {
    throw new Error('Invalid todo journal checksum or record version')
  }
  const parsed = transactionSchema.safeParse(decoded.transaction)
  if (!parsed.success) throw new Error('Invalid todo journal transaction')
  return parsed.data
}

/** @param {Buffer} buffer */
const lineBuffers = (buffer) => {
  const lines = []
  let start = 0
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0x0a) continue
    if (index > start) lines.push({ start, end: index + 1, data: buffer.subarray(start, index) })
    start = index + 1
  }
  return { lines, trailingStart: start }
}

export class JsonlJournalStorage {
  authoritative = true

  /**
   * @param {{filePath: string, initialTodoLists: TodoLists, now?: () => Date}} options
   */
  constructor({ filePath, initialTodoLists, now = () => new Date() }) {
    this.filePath = filePath
    this.initialTodoLists = initialTodoLists
    this.now = now
    /** @type {FileHandle | null} */
    this.fileHandle = null
    this.database = createEmptyDatabase()
    /** @type {Transaction[]} */
    this.transactions = []
    /** @type {Map<string, Transaction>} */
    this.transactionsById = new Map()
  }

  async load() {
    await mkdir(dirname(this.filePath), { recursive: true })
    this.fileHandle = await open(this.filePath, 'a+')
    const buffer = await readFile(this.filePath)
    const journalWasEmpty = buffer.length === 0
    const { lines, trailingStart } = lineBuffers(buffer)

    if (trailingStart < buffer.length) {
      await this.fileHandle.truncate(trailingStart)
    }

    const transactions = []
    for (let index = 0; index < lines.length; index += 1) {
      try {
        transactions.push(parseRecord(lines[index].data))
      } catch (error) {
        const isLast = index === lines.length - 1
        if (!isLast) {
          throw new Error(`Todo journal is corrupt at record ${index + 1}`, {
            cause: error,
          })
        }
        await this.fileHandle.truncate(lines[index].start)
      }
    }

    this.transactions = transactions
    this.transactionsById = new Map(
      transactions.map((transaction) => [transaction.id, transaction])
    )
    this.database = replayTransactions(transactions)

    if (this.transactions.length === 0) {
      const genesis = seedTransactionFromTodoLists({
        todoLists: this.initialTodoLists,
        occurredAt: this.now().toISOString(),
      })
      await this.append(genesis)
      if (journalWasEmpty && process.platform !== 'win32') {
        const directoryHandle = await open(dirname(this.filePath), 'r')
        try {
          await directoryHandle.sync()
        } finally {
          await directoryHandle.close()
        }
      }
    }

    return {
      hasReplica: true,
      basis: this.database.basis,
      authoritativeReadModel: projectTodoLists(this.database),
      pendingTransactions: [],
      transactionIds: this.transactions.map((transaction) => transaction.id),
    }
  }

  /** @param {Transaction} transaction */
  async append(transaction) {
    const previous = this.transactionsById.get(transaction.id)
    if (previous) {
      return { transaction: previous, authoritative: true, duplicate: true }
    }
    if (!this.fileHandle) throw new Error('Todo journal is not open')

    const canonical = {
      ...transaction,
      serverSeq: this.database.basis + 1,
      serverAt: this.now().toISOString(),
    }
    const applied = applyTransaction(this.database, canonical)
    if (applied.noOp) {
      return {
        transaction: applied.transaction,
        authoritative: true,
        noOp: true,
      }
    }

    const persisted = applied.transaction
    const buffer = encodeRecord(persisted)
    let offset = 0
    while (offset < buffer.length) {
      const { bytesWritten } = await this.fileHandle.write(
        buffer,
        offset,
        buffer.length - offset,
        null
      )
      if (bytesWritten === 0) throw new Error('Todo journal write made no progress')
      offset += bytesWritten
    }
    await this.fileHandle.datasync()

    this.database = applied.database
    this.transactions.push(persisted)
    this.transactionsById.set(persisted.id, persisted)
    return { transaction: persisted, authoritative: true }
  }

  async close() {
    const handle = this.fileHandle
    this.fileHandle = null
    await handle?.close()
  }
}
