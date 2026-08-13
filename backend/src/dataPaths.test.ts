import { describe, it } from 'vitest'
import assert from 'node:assert/strict'
import {
  DEFAULT_DATOM_LOG_PATH,
  DEV_DATOM_LOG_PATH,
  PREVIEW_DATOM_LOG_PATH,
} from './dataPaths.ts'

describe('durable datom log paths', () => {
  it('gives each durable lane its own journal under backend/data', () => {
    assert.match(DEV_DATOM_LOG_PATH, /data[/\\]dev[/\\]datoms\.jsonl$/)
    assert.match(PREVIEW_DATOM_LOG_PATH, /data[/\\]preview[/\\]datoms\.jsonl$/)
    assert.equal(DEFAULT_DATOM_LOG_PATH, DEV_DATOM_LOG_PATH)
    assert.notEqual(DEV_DATOM_LOG_PATH, PREVIEW_DATOM_LOG_PATH)
  })
})
