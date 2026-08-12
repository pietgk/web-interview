import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const readCoverage = async (directory) =>
  JSON.parse(await readFile(new URL(`${directory}/coverage-final.json`, import.meta.url)))

const fileNamed = (coverage, name) =>
  Object.values(coverage).find(({ path }) => path.endsWith(`/${name}`))

const node = await readCoverage('coverage-node')
const browser = await readCoverage('coverage-browser')
const nodeIstanbul = await readCoverage('coverage-node-istanbul')
const browserIstanbul = await readCoverage('coverage-browser-istanbul')
const nodeCall = fileNamed(node, 'imported-call.js')
const browserCall = fileNamed(browser, 'imported-call.js')
const nodeReact = fileNamed(node, 'named-react-import.js')
const browserReact = fileNamed(browser, 'named-react-import.js')
const nodeIstanbulCall = fileNamed(nodeIstanbul, 'imported-call.js')
const browserIstanbulCall = fileNamed(browserIstanbul, 'imported-call.js')
const nodeIstanbulReact = fileNamed(nodeIstanbul, 'named-react-import.js')
const browserIstanbulReact = fileNamed(browserIstanbul, 'named-react-import.js')

assert.deepEqual(nodeCall.statementMap, {
  0: { start: { line: 3, column: 20 }, end: { line: 3, column: null } },
})
assert.deepEqual(browserCall.statementMap, {
  0: { start: { line: 3, column: 21 }, end: { line: 3, column: null } },
})
assert.deepEqual(nodeReact.statementMap, {
  0: { start: { line: 3, column: 28 }, end: { line: 3, column: null } },
})
assert.deepEqual(Object.keys(browserReact.statementMap), ['0', '1'])
assert.equal(browserReact.statementMap[0].start.line, 1)
assert.equal(browserReact.statementMap[0].end.line, 1)
assert.deepEqual(browserReact.statementMap[1], nodeReact.statementMap[0])
assert.deepEqual(nodeCall.fnMap, browserCall.fnMap)
assert.deepEqual(nodeCall.branchMap, browserCall.branchMap)
assert.deepEqual(nodeReact.fnMap, browserReact.fnMap)
assert.deepEqual(nodeReact.branchMap, browserReact.branchMap)

for (const [nodeFile, browserFile] of [
  [nodeIstanbulCall, browserIstanbulCall],
  [nodeIstanbulReact, browserIstanbulReact],
]) {
  assert.deepEqual(nodeFile.statementMap, browserFile.statementMap)
  assert.deepEqual(nodeFile.fnMap, browserFile.fnMap)
  assert.deepEqual(nodeFile.branchMap, browserFile.branchMap)
}

process.stdout.write('Reproduced V8 incompatibility and Istanbul compatibility.\n')
