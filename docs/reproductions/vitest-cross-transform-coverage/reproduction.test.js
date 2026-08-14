import { expect, test } from 'vitest'
import { value } from './imported-call.js'
import { importedHook } from './named-react-import.js'

test('loads the imported call and named React import', () => {
  expect(value).toBe(1)
  expect(typeof importedHook).toBe('function')
})
