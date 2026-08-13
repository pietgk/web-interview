import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import {
  COVERAGE_PROVIDER,
  createEvidenceDigest,
  normalizeCoveragePath,
  PRODUCER_CONFIG_PATHS,
  resolveCoverageProviderProvenance,
} from './coverage-producers.ts'
import { ROOT } from './stages.ts'

const execFileAsync = promisify(execFile)
const repoPath = (path: string) => normalizeCoveragePath(path, ROOT)

const producerArg = process.argv[2]
if (!Object.hasOwn(PRODUCER_CONFIG_PATHS, producerArg)) {
  throw new Error(`Usage: node scripts/coverage-producer-cli.ts <${Object.keys(PRODUCER_CONFIG_PATHS).join('|')}>`)
}
const producer = producerArg as 'node' | 'storybook'
const providerProvenance = await resolveCoverageProviderProvenance(producer, ROOT)
if (providerProvenance.issues.length > 0) {
  throw new Error(providerProvenance.issues.join('\n'))
}

const directory = resolve(ROOT, '.coverage-reports', producer)
const mapPath = resolve(directory, 'coverage-final.json')
const summaryPath = resolve(directory, 'coverage-summary.json')
const map: Record<string, { path?: string }> = JSON.parse(await readFile(mapPath, 'utf8'))
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
  schemaVersion: 2,
  producer,
  coverageProvider: {
    ...COVERAGE_PROVIDER,
    version: providerProvenance.coverageProvider.version,
  },
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
