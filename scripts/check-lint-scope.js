/**
 * Proves every tracked source file is actually linted.
 *
 * ESLint reports an unmatched file as a *warning* and still exits 0, so a file
 * can silently leave lint scope and take its rules with it. Renaming `.js` to
 * `.ts` does exactly that when a config glob names extensions. This gate turns
 * that silent warning into a failure.
 *
 * A file is in scope when ESLint resolves a configuration for it. Files that are
 * deliberately excluded must be listed below with a reason, so widening
 * `ignores` in the config fails this gate rather than passing quietly.
 */
import { execFileSync } from 'node:child_process'
import { ESLint } from 'eslint'

/** Extensions this repo executes. Anything here must be linted or excused. */
const SOURCE_EXTENSIONS = ['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts']

/**
 * Paths allowed to sit outside lint scope, and why. Keep this list short: each
 * entry is a place where the repo's rules are not enforced.
 *
 * @type {readonly {prefix: string, rationale: string}[]}
 */
const INTENTIONALLY_UNLINTED = Object.freeze([
  {
    prefix: 'docs/reproductions/',
    rationale:
      'Bug reproductions are preserved exactly as reported; linting or autofixing them would destroy the evidence.',
  },
])

const sourcePattern = new RegExp(`\\.(?:${SOURCE_EXTENSIONS.join('|')})$`)

const trackedSources = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter((path) => path !== '' && sourcePattern.test(path))

/** @param {string} path */
const excuseFor = (path) =>
  INTENTIONALLY_UNLINTED.find((entry) => path.startsWith(entry.prefix)) ?? null

const eslint = new ESLint()

/** @type {string[]} */
const unlinted = []
/** @type {string[]} */
const excusedButLinted = []
let linted = 0

for (const path of trackedSources) {
  const configured = (await eslint.calculateConfigForFile(path)) !== undefined
  const ignored = await eslint.isPathIgnored(path)
  const covered = configured && !ignored
  const excuse = excuseFor(path)

  if (covered) {
    linted += 1
    if (excuse) excusedButLinted.push(path)
    continue
  }
  if (!excuse) unlinted.push(path)
}

const problems = []

if (unlinted.length > 0) {
  problems.push(
    `${unlinted.length} tracked source file(s) are not linted by any configuration:\n` +
      unlinted.map((path) => `  ${path}`).join('\n') +
      '\nEither bring them into scope in eslint.config.js, or add a justified ' +
      'entry to INTENTIONALLY_UNLINTED in this file.'
  )
}

if (excusedButLinted.length > 0) {
  problems.push(
    `${excusedButLinted.length} file(s) are excused in INTENTIONALLY_UNLINTED but are ` +
      `linted anyway, so the excuse is stale:\n` +
      excusedButLinted.map((path) => `  ${path}`).join('\n')
  )
}

if (problems.length > 0) {
  throw new Error(`Lint scope is incomplete:\n${problems.join('\n\n')}`)
}

const excused = trackedSources.length - linted
console.log(
  `Lint scope: ${linted} of ${trackedSources.length} tracked source files linted, ` +
    `${excused} excused.`
)
