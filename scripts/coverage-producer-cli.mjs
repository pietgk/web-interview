import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { createEvidenceDigest, PRODUCER_CONFIG_PATHS } from './coverage-producers.mjs'
import { ROOT } from './stages.mjs'

const execFileAsync = promisify(execFile)
/** @param {string} path */
const repoPath = (path) => relative(ROOT, resolve(path)).split(sep).join('/')

const producerArg = process.argv[2]
if (!Object.hasOwn(PRODUCER_CONFIG_PATHS, producerArg)) {
  throw new Error(`Usage: node scripts/coverage-producer-cli.mjs <${Object.keys(PRODUCER_CONFIG_PATHS).join('|')}>`)
}
const producer = /** @type {'node' | 'storybook'} */ (producerArg)

const directory = resolve(ROOT, '.coverage-reports', producer)
const mapPath = resolve(directory, 'coverage-final.json')
const summaryPath = resolve(directory, 'coverage-summary.json')
const map = JSON.parse(await readFile(mapPath, 'utf8'))
await readFile(summaryPath, 'utf8')

const sourcePaths = [...new Set(Object.entries(map).map(([reportedPath, file]) =>
  repoPath(file.path ?? reportedPath)
))].sort()
const configPaths = PRODUCER_CONFIG_PATHS[producer]
const inputPaths = [...sourcePaths, ...configPaths].sort()
const inputContents = Object.fromEntries(await Promise.all(inputPaths.map(async (path) => [
  path,
  await readFile(resolve(ROOT, path), 'utf8'),
])))
const sourceDigests = Object.fromEntries(sourcePaths.map((path) => [
  path,
  createEvidenceDigest({ [path]: inputContents[path] }),
]))
const [{ stdout: revision }, { stdout: status }] = await Promise.all([
  execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }),
  execFileAsync('git', ['status', '--porcelain'], { cwd: ROOT }),
])

const manifest = {
  schemaVersion: 1,
  producer,
  revision: revision.trim(),
  dirty: status.trim().length > 0,
  generatedAt: new Date().toISOString(),
  inputDigest: createEvidenceDigest(inputContents),
  sourceDigests,
  sourcePaths,
  configPaths,
  summaryPath: repoPath(summaryPath),
  mapPath: repoPath(mapPath),
}
await writeFile(resolve(directory, 'producer-evidence.json'), `${JSON.stringify(manifest, null, 2)}\n`)
process.stdout.write(`Captured ${producer} coverage evidence for ${sourcePaths.length} source files.\n`)
