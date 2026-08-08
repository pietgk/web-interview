import { describe, it } from 'vitest'
import assert from 'node:assert/strict'
import {
  API_ERROR_CODE,
  BROWSER_ERROR_CODE,
  apiErrorBodySchema,
} from './todoProtocol.js'

describe('API error contract', () => {
  it('accepts the public server shape with stable validation issues', () => {
    const body = {
      error: 'Validation failed',
      code: API_ERROR_CODE.VALIDATION_ERROR,
      issues: [{ path: ['datoms', 0, 2], message: 'Invalid value for text' }],
    }

    assert.deepEqual(apiErrorBodySchema.parse(body), body)
  })

  it('accepts a public server error without validation issues', () => {
    const body = {
      error: 'Malformed JSON',
      code: API_ERROR_CODE.MALFORMED_JSON,
    }

    assert.deepEqual(apiErrorBodySchema.parse(body), body)
  })

  it('rejects browser-only codes, unstable issue fields, and unknown body fields', () => {
    assert.equal(
      apiErrorBodySchema.safeParse({
        error: 'Could not reach the server',
        code: BROWSER_ERROR_CODE.NETWORK_ERROR,
      }).success,
      false
    )
    assert.equal(
      apiErrorBodySchema.safeParse({
        error: 'Validation failed',
        code: API_ERROR_CODE.VALIDATION_ERROR,
        issues: [{ path: ['datoms'], message: 'Invalid', received: 'raw Zod detail' }],
      }).success,
      false
    )
    assert.equal(
      apiErrorBodySchema.safeParse({
        error: 'Internal server error',
        code: API_ERROR_CODE.INTERNAL_ERROR,
        stack: 'must not cross the boundary',
      }).success,
      false
    )
  })
})
