import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  findCollapsingSelfTransitions,
  parseEdge,
  selfTransitionsByNode,
} from './check-diagrams.ts'

const diagram = (source: string) => `# doc\n\n\`\`\`mermaid\n${source}\n\`\`\`\n`

test('reports the edges Mermaid would drop, and which one survives', () => {
  // The exact regression this check exists for: a second self-transition was
  // added to `browsing` in ADR 007 and SELECT_LIST vanished from the render.
  const findings = findCollapsingSelfTransitions(
    diagram(`stateDiagram-v2
    [*] --> loading
    browsing --> browsing: SELECT_LIST
    browsing --> browsing: HYDRATE, ignored
    browsing --> drafting: ADD_LIST`)
  )

  assert.deepEqual(findings, [
    {
      diagram: 1,
      node: 'browsing',
      labels: ['SELECT_LIST', 'HYDRATE, ignored'],
    },
  ])
})

test('accepts one self-transition per node, which renders correctly', () => {
  assert.deepEqual(
    findCollapsingSelfTransitions(
      diagram(`stateDiagram-v2
    Settled --> Pending: change
    Pending --> Pending: change, restarts the timer
    Pending --> Settled: blur`)
    ),
    []
  )
})

test('accepts parallel edges between different nodes, which Mermaid keeps', () => {
  assert.deepEqual(
    findCollapsingSelfTransitions(
      diagram(`stateDiagram-v2
    Pending --> Settled: 500ms idle
    Pending --> Settled: blur
    Pending --> Settled: Enter
    Pending --> Settled: unmount`)
    ),
    []
  )
})

test('counts each diagram in a file separately', () => {
  const markdown =
    diagram('stateDiagram-v2\n    a --> b: fine') +
    diagram('stateDiagram-v2\n    z --> z: ONE\n    z --> z: TWO')
  const findings = findCollapsingSelfTransitions(markdown)
  assert.equal(findings.length, 1)
  assert.equal(findings[0].diagram, 2)
  assert.equal(findings[0].node, 'z')
})

test('treats a node and its inline definition as the same node', () => {
  const found = selfTransitionsByNode(`flowchart TD
  S["Screen state"]
  S -->|first| S
  S -->|second| S`)
  assert.deepEqual(found.get('S'), ['first', 'second'])
})

test('ignores arrows inside note bodies, which are prose', () => {
  assert.deepEqual(
    findCollapsingSelfTransitions(
      diagram(`stateDiagram-v2
    a --> b: real
    note right of a
        a --> a: not an edge
        a --> a: also not an edge
    end note`)
    ),
    []
  )
})

test('reads the arrow forms this repo actually uses', () => {
  assert.deepEqual(parseEdge('    browsing --> browsing: SELECT_LIST'), {
    from: 'browsing',
    to: 'browsing',
    label: 'SELECT_LIST',
  })
  assert.deepEqual(parseEdge('  U ==>|"EVENT"| S'), {
    from: 'U',
    to: 'S',
    label: '"EVENT"',
  })
  assert.deepEqual(parseEdge('  S -.->|"names the active list"| T'), {
    from: 'S',
    to: 'T',
    label: '"names the active list"',
  })
})

test('is not fooled by structure lines that contain punctuation', () => {
  assert.equal(parseEdge('  classDef screen fill:#0288d1,stroke:#0288d1'), null)
  assert.equal(parseEdge('  direction TB'), null)
  assert.equal(parseEdge('  %% a --> a: a comment'), null)
  // Start and end are pseudo-states, not nodes that can carry a self-loop.
  assert.equal(parseEdge('  [*] --> loading'), null)
})
