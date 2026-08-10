import assert from 'node:assert/strict'
import { test } from 'vitest'
import { resolveCommand } from './commandResolution.mjs'

const COMMANDS = [
  { name: 'start', aliases: ['go'] },
  { name: 'status' },
  { name: 'stop', aliases: ['quit'] },
]

test('an exact command name wins even when it is also a prefix', () => {
  assert.deepEqual(resolveCommand(COMMANDS, 'start'), { command: COMMANDS[0] })
})

test('an exact alias resolves to its command', () => {
  assert.deepEqual(resolveCommand(COMMANDS, 'quit'), { command: COMMANDS[2] })
})

test('a unique command-name prefix resolves to its command', () => {
  assert.deepEqual(resolveCommand(COMMANDS, 'star'), { command: COMMANDS[0] })
})

test('an ambiguous command-name prefix returns every match', () => {
  assert.deepEqual(resolveCommand(COMMANDS, 'st'), {
    ambiguous: [COMMANDS[0], COMMANDS[1], COMMANDS[2]],
  })
})

test('empty input requests no command', () => {
  assert.equal(resolveCommand(COMMANDS, ''), null)
})

test('unknown input is reported explicitly', () => {
  assert.deepEqual(resolveCommand(COMMANDS, 'missing'), { unknown: true })
})
