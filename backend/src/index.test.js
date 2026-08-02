import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readBackendConfig } from './config.js'

const backendDirectory = fileURLToPath(new URL('..', import.meta.url))

describe('backend startup', () => {
  it('parses runtime ports, CORS origins, storage, and seed data', () => {
    const seed = {
      list: {
        id: 'list',
        title: 'Configured list',
        todos: [],
      },
    }
    const config = readBackendConfig({
      APP_ENV: 'e2e',
      CORS_ORIGINS: 'http://127.0.0.1:3100, https://example.test',
      PORT: '3101',
      TODO_LOG_PATH: '/tmp/configured-todos.jsonl',
      TODO_SEED_JSON: JSON.stringify(seed),
    })

    assert.equal(config.port, 3101)
    assert.deepEqual(config.corsOrigins, [
      'http://127.0.0.1:3100',
      'https://example.test',
    ])
    assert.equal(config.todoLogPath, '/tmp/configured-todos.jsonl')
    assert.deepEqual(config.initialTodoLists, seed)
  })

  it('does not enable cross-origin access by default in production', () => {
    assert.deepEqual(readBackendConfig({ APP_ENV: 'production' }).corsOrigins, [])
  })

  it('refuses to run in E2E mode without an isolated todo journal', () => {
    const environment = {
      ...process.env,
      APP_ENV: 'e2e',
      PORT: '3101',
    }
    delete environment.TODO_LOG_PATH

    const result = spawnSync(process.execPath, ['src/index.js'], {
      cwd: backendDirectory,
      env: environment,
      encoding: 'utf8',
    })

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /E2E mode requires an explicit TODO_LOG_PATH/)
  })
})
