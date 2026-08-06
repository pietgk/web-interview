import { readFile } from 'node:fs/promises'
import { glob } from 'node:fs/promises'
import { ROOT } from './stages.mjs'

/**
 * Mermaid renders **only the last self-transition on a node**. Give a node two
 * edges pointing at itself and the earlier ones vanish from the SVG, with no
 * warning and no parse error: the diagram renders, looks correct, and quietly
 * describes less than its source does.
 *
 * Measured in a real browser against mermaid 11.15, `securityLevel: 'strict'`:
 *
 * | source | rendered |
 * | --- | --- |
 * | `a-->a: ALPHA`, `a-->a: BETA` | BETA only |
 * | `a-->a: ALPHA`, `a-->a: BETA`, `a-->a: DELTA` | DELTA only |
 * | `a-->b: ALPHA`, `a-->b: BETA`, `a-->b: DELTA` | all three |
 *
 * So parallel edges between two *different* nodes are safe; self-loops are not.
 * The same holds for `flowchart` and `stateDiagram-v2`.
 *
 * This cost a real edge twice while writing ADR 007, which is why it is a gate
 * rather than something to remember. A diagram worth having is one you check the
 * code against; a diagram that silently drops an edge is worse than none,
 * because it is believed.
 *
 * The fix is never to delete an edge: merge the labels into one transition where
 * they are really one thing, or move the second onto a `note`.
 */

const ARROW = /-{2,3}>|-\.-+>|={2,3}>|-{2,3}[xo]\b/

/** Lines that are structure or prose, never an edge. */
const NOT_AN_EDGE = /^\s*(?:%%|direction\b|classDef\b|class\b|click\b|style\b|linkStyle\b|subgraph\b)/i

/**
 * A node reference reduced to the id Mermaid keys on, so `S["Screen state"]`
 * and a later bare `S` are understood to be the same node.
 *
 * @param {string} token
 * @returns {string | null}
 */
const nodeId = (token) => {
  const trimmed = token.trim()
  if (!trimmed || trimmed === '[*]') return null
  const [id] = /^[A-Za-z0-9_.-]+/.exec(trimmed) ?? []
  return id ?? null
}

/**
 * @param {string} line
 * @returns {{from: string, to: string, label: string} | null}
 */
export const parseEdge = (line) => {
  if (NOT_AN_EDGE.test(line)) return null
  const arrow = ARROW.exec(line)
  if (!arrow) return null

  const from = nodeId(line.slice(0, arrow.index))
  let rest = line.slice(arrow.index + arrow[0].length)
  let label = ''

  // `A -->|label| B`, the flowchart form.
  const piped = /^\s*\|([^|]*)\|/.exec(rest)
  if (piped) {
    label = piped[1].trim()
    rest = rest.slice(piped[0].length)
  }

  // `A --> B: label`, the state-diagram form. The label runs to end of line.
  const colon = rest.indexOf(':')
  if (colon !== -1) {
    if (!label) label = rest.slice(colon + 1).trim()
    rest = rest.slice(0, colon)
  }

  const to = nodeId(rest)
  if (!from || !to) return null
  return { from, to, label: label || '(unlabelled)' }
}

/**
 * @param {string} source one fenced ```mermaid block
 * @returns {Map<string, string[]>} node id -> labels of its self-transitions
 */
export const selfTransitionsByNode = (source) => {
  /** @type {Map<string, string[]>} */
  const found = new Map()
  let insideNote = false

  for (const line of source.split('\n')) {
    // Note bodies are prose and may contain anything, including arrows.
    if (/^\s*note\b/i.test(line)) {
      insideNote = !/^\s*note\b.*:/i.test(line)
      continue
    }
    if (insideNote) {
      if (/^\s*end note\b/i.test(line)) insideNote = false
      continue
    }

    const edge = parseEdge(line)
    if (!edge || edge.from !== edge.to) continue
    found.set(edge.from, [...(found.get(edge.from) ?? []), edge.label])
  }

  return found
}

/**
 * @param {string} markdown
 * @returns {{diagram: number, node: string, labels: string[]}[]}
 */
export const findCollapsingSelfTransitions = (markdown) =>
  [...markdown.matchAll(/```mermaid\n([\s\S]*?)```/g)].flatMap(([, source], index) =>
    [...selfTransitionsByNode(source)]
      .filter(([, labels]) => labels.length > 1)
      .map(([node, labels]) => ({ diagram: index + 1, node, labels }))
  )

/** @param {{diagram: number, node: string, labels: string[]}} finding @param {string} path */
export const describeFinding = ({ diagram, node, labels }, path) =>
  `${path}: diagram ${diagram}, node "${node}" has ${labels.length} self-transitions. ` +
  `Mermaid renders only the last ("${labels.at(-1)}") and silently drops ` +
  `${labels.slice(0, -1).map((label) => `"${label}"`).join(', ')}. ` +
  'Merge them into one transition, or move one onto a note.'

const run = async () => {
  /** @type {string[]} */
  const problems = []
  let files = 0
  let diagrams = 0

  for await (const path of glob('**/*.md', {
    cwd: ROOT,
    exclude: (name) => name === 'node_modules' || name === 'coverage',
  })) {
    const markdown = await readFile(`${ROOT}/${path}`, 'utf8')
    if (!markdown.includes('```mermaid')) continue
    files += 1
    diagrams += (markdown.match(/```mermaid\n/g) ?? []).length
    for (const finding of findCollapsingSelfTransitions(markdown)) {
      problems.push(describeFinding(finding, path))
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(problem)
    console.error(`\n${problems.length} diagram(s) render fewer edges than their source describes.`)
    process.exitCode = 1
    return
  }

  console.log(`${diagrams} diagram(s) in ${files} file(s): every edge survives rendering.`)
}

if (import.meta.url === `file://${process.argv[1]}`) await run()
