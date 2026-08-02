import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const backendDirectory = fileURLToPath(new URL('..', import.meta.url))

describe('backend startup', () => {
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
