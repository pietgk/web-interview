/**
 * Evidence treatments define producer and verdict semantics once. Registry
 * entries select one reviewed treatment and explain why that source belongs at
 * that seam.
 */
export const TREATMENTS = Object.freeze({
  'node-runtime': Object.freeze({ producer: 'node', verdict: 'exact-coverage' }),
  'storybook-controller': Object.freeze({ producer: 'storybook', verdict: 'exact-coverage' }),
  'rendered-ui': Object.freeze({ producer: 'storybook', verdict: 'story-play-axe' }),
  'playwright-bootstrap': Object.freeze({ producer: 'playwright', verdict: 'assembled-journey' }),
  'test-support-node': Object.freeze({ producer: 'node', verdict: 'explicit-accounting' }),
  'test-support-storybook': Object.freeze({ producer: 'storybook', verdict: 'explicit-accounting' }),
  'type-only': Object.freeze({ producer: 'typescript', verdict: 'typecheck' }),
})

/** @typedef {keyof typeof TREATMENTS} EvidenceTreatment */
/** @typedef {{path: string, treatment: EvidenceTreatment, rationale: string}} EvidenceRegistryEntry */

/** @type {readonly EvidenceRegistryEntry[]} */
export const SOURCE_EVIDENCE_ENTRIES = Object.freeze([
  { path: 'backend/src/app.js', treatment: 'node-runtime', rationale: 'Express composition has a deterministic injected-service interface exercised in Node.' },
  { path: 'backend/src/config.js', treatment: 'node-runtime', rationale: 'Environment parsing is deterministic process configuration exercised in Node.' },
  { path: 'backend/src/dataPaths.js', treatment: 'node-runtime', rationale: 'Journal path selection is deterministic process configuration exercised in Node.' },
  { path: 'backend/src/index.js', treatment: 'playwright-bootstrap', rationale: 'Backend process startup is exercised through assembled Playwright journeys.' },
  { path: 'backend/src/routes/datoms.js', treatment: 'node-runtime', rationale: 'HTTP route behavior has an injected service boundary exercised in Node.' },
  { path: 'backend/src/seed.js', treatment: 'node-runtime', rationale: 'Seed conversion is deterministic runtime logic exercised in Node.' },
  { path: 'backend/src/testing/sseClient.js', treatment: 'test-support-node', rationale: 'Node integration tests consume this SSE protocol test client.' },
  { path: 'backend/src/todos/datomJournal.js', treatment: 'node-runtime', rationale: 'Journal persistence has a filesystem adapter boundary exercised in Node.' },
  { path: 'backend/src/todos/datomService.js', treatment: 'node-runtime', rationale: 'Datom service policy has a deterministic journal and clock boundary exercised in Node.' },

  { path: 'frontend/src/App.jsx', treatment: 'rendered-ui', rationale: 'The application shell is protected by Storybook states, plays, and accessibility checks.' },
  { path: 'frontend/src/index.jsx', treatment: 'playwright-bootstrap', rationale: 'DOM and theme bootstrap is exercised through assembled Playwright journeys.' },
  { path: 'frontend/src/testing/fakeDatomServer.js', treatment: 'node-runtime', rationale: 'The in-memory transport adapter has a direct deterministic contract exercised in Node.' },
  { path: 'frontend/src/testing/storyDocs.js', treatment: 'test-support-storybook', rationale: 'Storybook documentation metadata consumes this story-only helper.' },
  { path: 'frontend/src/testing/storyHarness.jsx', treatment: 'test-support-storybook', rationale: 'Storybook compositions consume this browser-only harness.' },
  { path: 'frontend/src/theme.js', treatment: 'rendered-ui', rationale: 'Theme behavior is rendered and measured by Storybook browser scenarios.' },
  { path: 'frontend/src/themeTokens.d.ts', treatment: 'type-only', rationale: 'The declaration augments MUI types and emits no runtime code.' },

  { path: 'frontend/src/todos/components/CompletionField.jsx', treatment: 'rendered-ui', rationale: 'The control is protected by Storybook interaction and accessibility scenarios.' },
  { path: 'frontend/src/todos/components/DeleteTodoListDialog.jsx', treatment: 'rendered-ui', rationale: 'The dialog is protected by Storybook interaction and accessibility scenarios.' },
  { path: 'frontend/src/todos/components/DueIn.jsx', treatment: 'rendered-ui', rationale: 'The due-date presentation is protected by Storybook states and accessibility checks.' },
  { path: 'frontend/src/todos/components/StatusBar.jsx', treatment: 'rendered-ui', rationale: 'The status presentation is protected by Storybook states and accessibility checks.' },
  { path: 'frontend/src/todos/components/StatusDetailsDialog.jsx', treatment: 'rendered-ui', rationale: 'The status dialog is protected by Storybook interaction and accessibility scenarios.' },
  { path: 'frontend/src/todos/components/TodoComposer.jsx', treatment: 'rendered-ui', rationale: 'Composer focus and commit behavior is asserted through rendered Storybook interaction.' },
  { path: 'frontend/src/todos/components/TodoEditor.jsx', treatment: 'rendered-ui', rationale: 'The editor composition is protected by Storybook states and interactions.' },
  { path: 'frontend/src/todos/components/TodoItem.jsx', treatment: 'rendered-ui', rationale: 'Todo editing is protected by Storybook interaction, layout, and accessibility scenarios.' },
  { path: 'frontend/src/todos/components/TodoListForm.jsx', treatment: 'rendered-ui', rationale: 'Active-list behavior is protected by Storybook interaction and accessibility scenarios.' },
  { path: 'frontend/src/todos/components/TodoListTitleField.jsx', treatment: 'rendered-ui', rationale: 'Title editing is protected by Storybook interaction and accessibility scenarios.' },
  { path: 'frontend/src/todos/components/TodoLists.jsx', treatment: 'rendered-ui', rationale: 'List navigation and composition are protected by Storybook browser scenarios.' },
  { path: 'frontend/src/todos/components/TodoRow.jsx', treatment: 'rendered-ui', rationale: 'This layout wrapper is exercised through its TodoItem and TodoComposer consumers.' },
  { path: 'frontend/src/todos/components/focusLeft.js', treatment: 'rendered-ui', rationale: 'This shallow DOM focus helper is meaningful only through the rendered composer interaction.' },
  { path: 'frontend/src/todos/legacyReplica.js', treatment: 'playwright-bootstrap', rationale: 'This retained browser-storage migration is a startup side effect, not an exact coverage seam.' },
  { path: 'frontend/src/todos/todoClient.js', treatment: 'node-runtime', rationale: 'The event-driven client coordinates injected transport, optimistic state, outbox delivery, and stream lifecycle exercised in Node.' },
  { path: 'frontend/src/todos/todoListCommands.js', treatment: 'node-runtime', rationale: 'The command boundary deterministically translates domain actions into client writes.' },
  { path: 'frontend/src/todos/todoListsScreenView.js', treatment: 'node-runtime', rationale: 'Screen view projection is deterministic runtime logic exercised in Node.' },
  { path: 'frontend/src/todos/todoListsUiState.js', treatment: 'node-runtime', rationale: 'Navigation state transitions are deterministic runtime logic exercised in Node.' },
  { path: 'frontend/src/todos/todoModel.js', treatment: 'node-runtime', rationale: 'Todo List and Todo domain projections are deterministic runtime logic exercised in Node.' },
  { path: 'frontend/src/todos/trustedClock.js', treatment: 'node-runtime', rationale: 'Trusted server-time adoption, calendar scheduling, and identifier minting form a deterministic injected-clock interface exercised in Node.' },
  { path: 'frontend/src/todos/useGhostComposer.js', treatment: 'storybook-controller', rationale: 'React state and lifecycle are part of the ghost composer interface asserted by browser stories.' },
  { path: 'frontend/src/todos/useSettledText.js', treatment: 'storybook-controller', rationale: 'React timing, cleanup, and prop adoption are observable through browser-owned field consumers.' },
  { path: 'frontend/src/todos/useTodoLists.js', treatment: 'storybook-controller', rationale: 'React subscription and client lifecycle behavior is observable through the mounted application.' },

  { path: 'shared/src/calendarDate.js', treatment: 'node-runtime', rationale: 'Calendar-date validation is deterministic shared runtime logic exercised in Node.' },
  { path: 'shared/src/datom.js', treatment: 'node-runtime', rationale: 'Datom validation and identity rules are deterministic shared runtime logic exercised in Node.' },
  { path: 'shared/src/datomStore.js', treatment: 'node-runtime', rationale: 'The shared fold and projection expose a deterministic in-process interface exercised in Node.' },
  { path: 'shared/src/selectors.js', treatment: 'node-runtime', rationale: 'Todo List selectors are deterministic shared runtime logic exercised in Node.' },
  { path: 'shared/src/todoProtocol.js', treatment: 'node-runtime', rationale: 'Protocol constants and schemas are deterministic shared runtime contracts exercised in Node.' },
  { path: 'shared/src/types.js', treatment: 'type-only', rationale: 'JSDoc declarations emit no runtime code.' },
  { path: 'shared/src/ulid.js', treatment: 'node-runtime', rationale: 'ULID parsing and minting expose deterministic injected-clock behavior exercised in Node.' },
])

/**
 * @param {{entries?: readonly EvidenceRegistryEntry[], sourcePaths: string[]}} input
 * @returns {string[]}
 */
export const validateSourceEvidenceRegistry = ({
  entries = SOURCE_EVIDENCE_ENTRIES,
  sourcePaths,
}) => {
  const issues = []
  const counts = new Map()
  for (const { path } of entries) counts.set(path, (counts.get(path) ?? 0) + 1)

  for (const [path, count] of counts) {
    if (count > 1) issues.push(`${path}: duplicate evidence registry entry`)
  }
  for (const { path, treatment, rationale } of entries) {
    if (!rationale.trim()) issues.push(`${path}: evidence rationale is required`)
    if (!TREATMENTS[treatment]) issues.push(`${path}: unknown evidence treatment ${treatment}`)
  }

  const registryPaths = new Set(entries.map(({ path }) => path))
  const sourceSet = new Set(sourcePaths)
  for (const path of sourcePaths) {
    if (!registryPaths.has(path)) issues.push(`${path}: no evidence registry entry`)
  }
  for (const path of registryPaths) {
    if (!sourceSet.has(path)) issues.push(`${path}: evidence registry entry has no source file`)
  }
  return issues
}

/** @type {ReadonlyMap<string, EvidenceRegistryEntry>} */
export const SOURCE_EVIDENCE_BY_PATH = new Map(
  SOURCE_EVIDENCE_ENTRIES.map((entry) => [entry.path, entry])
)

/** @param {string} path */
export const evidenceForSourcePath = (path) => SOURCE_EVIDENCE_BY_PATH.get(path)

/** @param {'node' | 'storybook'} producer */
export const exactCoveragePathsFor = (producer) => SOURCE_EVIDENCE_ENTRIES
  .filter(({ treatment }) => {
    const definition = TREATMENTS[treatment]
    return definition.producer === producer && definition.verdict === 'exact-coverage'
  })
  .map(({ path }) => path)
  .sort()
