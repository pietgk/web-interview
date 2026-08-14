import { mkdir, open, readFile } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { dirname } from 'node:path'
import { datomSchema } from '@web-interview/todos/datom'
import type { Datom } from '@web-interview/todos/types'

const NEWLINE = 0x0a

/**
 * One line is one datom, serialized as a bare JSON array of five values. There is
 * no checksum: a torn write always loses the closing bracket and therefore always
 * fails `JSON.parse`, so a checksum would add roughly 70% to each line to detect
 * only bit rot.
 */
const completeLines = (buffer: Buffer) => {
  const lines: Array<{ start: number, data: Buffer }> = []
  let start = 0
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== NEWLINE) continue
    if (index > start) lines.push({ start, data: buffer.subarray(start, index) })
    start = index + 1
  }
  return { lines, trailingStart: start }
}

const parseLine = (line: Buffer): Datom => {
  const parsed = datomSchema.safeParse(JSON.parse(line.toString('utf8')))
  if (!parsed.success) throw new Error('Journal line is not a valid datom')
  return parsed.data
}

/** Append-only JSONL log of every valid datom, including the ones that lost. */
export class DatomJournal {
  filePath: string
  #fileHandle: FileHandle | null = null

  constructor({ filePath }: { filePath: string }) {
    this.filePath = filePath
  }

  /**
   * Replays the journal, discarding an unterminated or unparseable final line and
   * failing on any earlier bad line.
   */
  async open(): Promise<Datom[]> {
    await mkdir(dirname(this.filePath), { recursive: true })
    const fileHandle = await open(this.filePath, 'a+')
    this.#fileHandle = fileHandle

    try {
      const buffer = await readFile(this.filePath)
      const { lines, trailingStart } = completeLines(buffer)

      if (trailingStart < buffer.length) await fileHandle.truncate(trailingStart)

      const datoms: Datom[] = []
      for (const [index, line] of lines.entries()) {
        try {
          datoms.push(parseLine(line.data))
        } catch (error) {
          if (index !== lines.length - 1) {
            throw new Error(`Datom journal is corrupt at line ${index + 1}`, { cause: error })
          }
          await fileHandle.truncate(line.start)
        }
      }
      return datoms
    } catch (error) {
      await this.close()
      throw error
    }
  }

  /**
   * `datasync()` completes before this resolves, so the server is never less
   * durable than a browser that has already rendered the datom.
   */
  async append(datoms: Datom[]) {
    const fileHandle = this.#fileHandle
    if (!fileHandle) throw new Error('Datom journal is not open')
    if (datoms.length === 0) return

    const buffer = Buffer.from(
      datoms.map((datom) => `${JSON.stringify(datom)}\n`).join(''),
      'utf8'
    )
    let offset = 0
    while (offset < buffer.length) {
      const { bytesWritten } = await fileHandle.write(
        buffer,
        offset,
        buffer.length - offset,
        null
      )
      // Unreachable without stubbing the write, which would stub the behaviour
      // this class exists to provide.
      /* v8 ignore next */
      if (bytesWritten === 0) throw new Error('Datom journal write made no progress')
      offset += bytesWritten
    }
    await fileHandle.datasync()
  }

  async close() {
    const fileHandle = this.#fileHandle
    this.#fileHandle = null
    await fileHandle?.close()
  }
}
