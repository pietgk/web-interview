import { describe, it } from 'vitest'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readBackendConfig } from './config.ts'

const backendDirectory = fileURLToPath(new URL('..', import.meta.url))

describe('backend startup', () => {
  it('parses runtime ports, CORS origins, storage, and seed data', () => {
    const seed = [{ title: 'Configured list', todos: [] }]
    const config = readBackendConfig({
      APP_ENV: 'e2e',
      CORS_ORIGINS: 'http://127.0.0.1:3100, https://example.test',
      PORT: '3101',
      DATOM_LOG_PATH: '/tmp/configured-datoms.jsonl',
      TODO_SEED_JSON: JSON.stringify(seed),
    })

    assert.equal(config.port, 3101)
    assert.deepEqual(config.corsOrigins, [
      'http://127.0.0.1:3100',
      'https://example.test',
    ])
    assert.equal(config.datomLogPath, '/tmp/configured-datoms.jsonl')
    assert.deepEqual(config.initialTodoLists, seed)
  })

  it('rejects a seed that carries entity ids the server has not minted', () => {
    assert.throws(
      () => readBackendConfig({
        TODO_SEED_JSON: JSON.stringify([{ id: 'list', title: 'Configured list', todos: [] }]),
      }),
      /TODO_SEED_JSON must contain valid Todo Lists/
    )
  })

  it('does not enable cross-origin access by default in production', () => {
    assert.deepEqual(readBackendConfig({ APP_ENV: 'production' }).corsOrigins, [])
  })

  it('refuses to run in E2E mode without an isolated datom journal', () => {
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      APP_ENV: 'e2e',
      PORT: '3101',
    }
    delete environment['DATOM_LOG_PATH']

    const result = spawnSync(process.execPath, ['src/index.ts'], {
      cwd: backendDirectory,
      env: environment,
      encoding: 'utf8',
    })

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /E2E mode requires an explicit DATOM_LOG_PATH/)
  })
})
