# Fresh-session handoff: combined automation map compatibility

Date: 2026-08-12

## Objective

Investigate whether the optional combined Node and Storybook automation view can be made available
through a principled fix. Explore two paths without weakening the existing safety rule:

1. Improve executable-map diagnostics and create a minimal upstream reproduction for the
   Node-SSR versus browser-transform mismatch.
2. Prototype a cohesive internal split of `todoClient.js` only if it improves the production
   design independently of coverage.

Keep a production refactor only when it improves module depth and locality. Keep a coverage merge
only when compatibility can be proved rather than inferred from similar-looking coordinates.

## Start here

Read these files before changing code:

- [`AGENTS.md`](../../AGENTS.md)
- [`CONTEXT.md`](../../CONTEXT.md)
- [`docs/adr/006-test-execution-model.md`](../adr/006-test-execution-model.md)
- [`docs/adr/010-producer-owned-coverage-evidence.md`](../adr/010-producer-owned-coverage-evidence.md)
- [`docs/coverage-evidence-audit.md`](../coverage-evidence-audit.md)
- [`docs/plans/producer-owned-coverage-evidence.md`](./producer-owned-coverage-evidence.md)
- [`scripts/coverage-producers.mjs`](../../scripts/coverage-producers.mjs)
- [`scripts/coverage-evidence.mjs`](../../scripts/coverage-evidence.mjs)
- [`scripts/coverage-evidence-cli.mjs`](../../scripts/coverage-evidence-cli.mjs)
- [`frontend/src/todos/todoClient.js`](../../frontend/src/todos/todoClient.js)
- [`frontend/src/todos/todoClient.test.js`](../../frontend/src/todos/todoClient.test.js)

Use the repository's `diagnosing-bugs` and `codebase-design` skills. Use TDD for any production
change or executable-map comparison change.

## Repository state at handoff

The producer-owned coverage implementation is complete at commit:

```text
3ce3c1ea82ecb7454b9c8a16baf10373507dcf73
```

The worktree was clean before this handoff document was added. Do not rebuild the producer
registry, owner baselines, stability admission, or verdict cutover.

The canonical gate was green at that commit:

```text
  typecheck           PASS     2.6s
  lint                PASS     1.4s
  diagrams            PASS     0.0s
  audit               PASS     2.2s
  unit                PASS     1.7s
  storybook           PASS    20.8s
  storybook-stability PASS   162.5s
  e2e                 PASS    23.5s
  build               PASS     1.7s
  lighthouse          PASS    38.2s
  coverage            PASS     0.7s   combined owned runtime (Node + Storybook owner-selected): 96.35% stmt · 94.10% branch · 95.14% func

  GREEN · 11 checks
```

The strict clean admission also produced ten identical independent Storybook collections:

```text
b1a51785a97e9aeead1cf5e2f51f456da4c5d27895ff08bd1b2c2213c10d4abf
```

## What is already safe

`createCombinedAutomationReach` compares source digests and complete Istanbul executable maps
before combining counters. If any overlapping file is incompatible, the complete optional union
is withheld. The owner-specific Node and Storybook verdicts remain valid and independent.

Do not relax this behavior. In particular, do not:

- ignore columns globally;
- merge by counter number when locations differ;
- combine only the apparently compatible files and call the result complete;
- let Storybook overlap rescue a Node-owned verdict, or the reverse;
- change production code solely to make an informational coverage view appear.

## Confirmed reproduction

The current generated reports are:

```text
.coverage-reports/node/coverage-final.json
.coverage-reports/storybook/coverage-final.json
```

A tight reproduction for `todoClient.js` is a direct deep equality assertion over its
`statementMap`, `fnMap`, and `branchMap`. It fails deterministically at one statement:

```text
todoClient.js
  statementMap: 233 Node / 233 Storybook, 1 differing entry
  fnMap:         46 Node / 46 Storybook, 0 differing entries
  branchMap:     39 Node / 39 Storybook, 0 differing entries

statement counter 38
  Node:      line 131, column 14 to end of line
  Storybook: line 131, column 15 to end of line
```

The source is:

```js
const mint = createUlidMinter(serverNow)
```

Both producer manifests contain the same source digest for the file:

```text
5f3b1374c17cebdea77ec20c2b4aae52c12bf8fe83c80c50dabad895a496aa78
```

The relevant hit counts differ because the suites execute the statement independently:

```text
Node:      17
Storybook: 15
```

Recreate the reports when necessary with:

```bash
mise exec node@22 -- npm run verify unit storybook coverage
```

## Confirmed cause

Package skew is ruled out. Root and frontend both resolve:

```text
vitest                 4.1.10
@vitest/coverage-v8    4.1.10
vite                   6.4.3
ast-v8-to-istanbul     1.0.5
```

The installed coverage provider and converter implementations are byte-identical across the two
install roots.

The difference originates in environment-specific Vite transformations and their source maps:

- Node coverage uses Vite's SSR transform.
- Storybook coverage uses Vite's browser transform.
- Vitest parses the transformed code, then uses `ast-v8-to-istanbul` and the transform's source
  map to reconstruct original-source locations.

For the imported minter call, Node transforms the source approximately to:

```js
const mint = (0, __vite_ssr_import_2__.createUlidMinter)(serverNow)
```

The `(0, importedFunction)` form preserves direct-call JavaScript semantics. Its source map maps
the generated wrapper to column 14, while the browser leaves the direct call intact and maps
`createUlidMinter` to column 15.

The hook files expose a second, more structural difference. Storybook's browser transform turns a
named React import approximately into:

```js
import __vite__cjsImport0_react from ".../react.js"
const useState = __vite__cjsImport0_react["useState"]
```

Vitest counts the generated `const` as an executable statement and maps it onto the original
import line. Vitest explicitly ignores analogous generated SSR import declarations, but not this
browser CJS interop binding.

Disabling React Fast Refresh did not change any executable-map differences and was reverted.
All temporary coverage-provider instrumentation was removed. No temporary coverage-map or
hook-map debug tags should remain in the workspace.

## Current incompatibility inventory

The values below are differing map entries, not coverage hit differences:

| File | Statement map | Function map | Branch map |
| --- | ---: | ---: | ---: |
| `frontend/src/todos/todoClient.js` | 1 | 0 | 0 |
| `frontend/src/todos/useGhostComposer.js` | 20 | 0 | 0 |
| `frontend/src/todos/useSettledText.js` | 44 | 0 | 0 |
| `frontend/src/todos/useTodoLists.js` | 15 | 0 | 0 |

For the hooks, the browser map contains one extra statement for each generated React import
binding. Most remaining statement locations are shifted one column because the transformed
browser binding and SSR wrapper source maps choose different original positions.

Examples of browser-only generated statements mapped to original import line 1:

```text
useGhostComposer.js  1:31 to end of line
useSettledText.js    1:196-233, 1:250-284, 1:303 to end of line
useTodoLists.js      1:62 to end of line
```

This means a blanket one-column normalization would be incomplete and unsafe.

## Relevant upstream context

The behavior matches an active cross-transform coverage-merging limitation:

- Vitest discussion: <https://github.com/vitest-dev/vitest/discussions/9637>
- Istanbul issue: <https://github.com/istanbuljs/istanbuljs/issues/719>
- Istanbul attempted fix referenced by the Vitest maintainer:
  <https://github.com/istanbuljs/istanbuljs/pull/838>

The Vitest maintainer's position is that different compilers can emit different source-map
mappings without a universal equivalence guarantee. Istanbul currently treats different location
objects as different executable paths. A resilient upstream merge may need to compare overlapping
source nodes, but accurate general equivalence is unresolved.

## Workstream 1: detailed diagnostics

The current report says only `executable maps differ between producers`. Improve it so a future
reader can distinguish a minor location mismatch from a structurally different map without opening
large JSON artifacts.

### Desired comparison result

Add a focused comparison function in `scripts/coverage-producers.mjs`, or a nearby deep module,
that returns bounded structured diagnostics for each map kind:

- entry counts for Node and Storybook;
- number of differing entries;
- number present only in Node and only in Storybook;
- a small deterministic sample of mismatches;
- counter id and both locations when the same id differs;
- confirmation that source digests match;
- no raw full-map dump in the generated report.

The compatibility verdict must continue to require exact complete-map equality unless a later,
separately justified canonicalization can prove equivalence.

### Example target report

```text
frontend/src/todos/todoClient.js
  Source digest: matches
  Statements: 233 Node / 233 Storybook; 1 location differs
    Counter 38: Node 131:14-end, Storybook 131:15-end
  Functions: 46 / 46; exact match
  Branches: 39 / 39; exact match
  Combined counters withheld
```

For a hook, the report should say that Storybook has an additional statement mapped to the import
line rather than presenting every subsequent counter-id mismatch as independently meaningful.

### Tests first

Add failing tests in `scripts/coverage-producers.test.mjs` and report-renderer tests covering:

- same keys with one changed source column;
- an extra generated statement in one producer;
- function and branch maps that still match;
- deterministic truncation of mismatch samples;
- no accidental publication of the combined explorer while incompatible.

## Workstream 2: minimal upstream reproduction

Build the smallest disposable fixture that runs the same original source through Vitest Node SSR
coverage and Vitest browser coverage. Start with:

```js
import { importedFunction } from './dependency.js'

export const value = importedFunction()
```

The reproduction succeeds when it demonstrates the original one-column shift with identical
source and package versions. Add a named React import case separately to reproduce the generated
browser CJS binding.

Prefer a minimal external reproduction over adding permanent synthetic production modules to this
repository. If an upstream issue is filed, include:

- exact versions;
- both transformed snippets;
- both source maps or the minimal relevant mappings;
- both Istanbul executable maps;
- why merging by counter id would corrupt or misrepresent general cases;
- the distinction between the imported-call shift and generated React import statement.

## Workstream 3: `todoClient` design experiment

Explore a production split as an architectural hypothesis, not as a coverage workaround.

`createTodoClient` currently presents a small external interface while hiding substantial coupled
behavior. It is already a deep module. Its internal responsibilities include:

- trusted server-time adoption and half-round-trip adjustment;
- calendar-day calculation and midnight scheduling;
- ULID minting from trusted time;
- optimistic `DatomStore` application;
- outbox delivery, retry, rejection, and rehydration;
- SSE lifecycle, cursor, epoch, and resynchronization;
- status and today subscriptions.

The most credible cohesive extraction is an internal trusted-clock module that owns:

- server-time offset and adoption;
- half-round-trip adjustment;
- `serverNow`;
- `today` derivation and midnight scheduling;
- ULID minting;
- today subscriptions;
- timer cleanup.

Do not expose all this internal state as a broad interface. Look for a small interface with high
leverage, possibly shaped around adopting a server timestamp, reading or subscribing to today,
minting identifiers, and stopping timers. Preserve the external `createTodoClient` interface.

### Throwaway coverage probe

Before committing a refactor, prototype it and recollect both maps. Record whether the mismatch:

1. disappears because both producers now map the same canonical source construct;
2. moves to the new imported factory call;
3. splits across multiple files;
4. remains unchanged.

The likely outcome is that a simple extraction merely moves the imported-call mismatch. A result
is valuable only when the reason is understood.

### Two-axis acceptance test

Judge the prototype independently on both axes:

| Architecture | Evidence | Decision |
| --- | --- | --- |
| Better | Compatible | Keep; ideal outcome |
| Better | Still incompatible | Keep only for the architectural improvement; continue tooling work |
| Worse or neutral | Compatible | Discard; do not distort production code for an informational view |
| Worse or neutral | Still incompatible | Discard |

Architectural improvement means:

- a smaller, clearer internal interface;
- stronger locality for the clock and timer invariants;
- no callback maze or exposed mutable state;
- no additional hypothetical adapter;
- tests exercise behavior through the module interface and survive internal refactors;
- the external `todoClient` interface and product behavior remain unchanged.

## Decision boundary for canonicalization

A local compatibility normalizer may be considered only after the minimal reproduction and design
experiment. It must use a principled canonical identity, such as original-source AST nodes, rather
than heuristics like subtracting one column.

Before accepting canonicalization, prove with adversarial tests that it:

- recognizes the imported-call case as equivalent;
- excludes generated import bindings that have no original executable statement;
- rejects genuinely different statements on the same line;
- rejects different branch shapes and function shapes;
- handles reordered or inserted counter ids;
- never merges files with different source digests;
- produces a complete valid Istanbul map and line explorer.

If this cannot be proved cleanly, keep the optional union withheld and improve only the diagnostics.

## Verification and cleanup

During implementation:

```bash
mise exec node@22 -- npm run verify unit
mise exec node@22 -- npm run verify unit storybook coverage
```

Before completion:

```bash
rg -n '\[DEBUG-(covmap|hookmap)\]' . --glob '!node_modules/**'
mise exec node@22 -- npm run coverage:check-storybook-stability
mise exec node@22 -- npm run verify
```

Follow the repository rule for the exact verification summary. Remove all throwaway fixtures and
instrumentation unless a minimal reproduction is deliberately retained and documented.

## Done when

- The report explains each incompatibility with bounded, actionable map diagnostics.
- A minimal reproduction proves where the Node SSR and browser transform maps diverge.
- The `todoClient` split hypothesis has a recorded two-axis result and no unexplained code motion.
- Any retained production refactor improves module depth independently of coverage.
- Any enabled combined view is backed by proven compatible or safely canonicalized complete maps.
- Otherwise, withholding remains explicit and the owner-specific verdicts remain unchanged.
- All tests, stability admission, and full verification pass.

## Implementation outcome

Status: implemented on 2026-08-12.

### Diagnostics

The optional union still requires exact complete-map equality. Incompatible files now carry
bounded structured diagnostics with source-digest status, per-kind entry counts, aligned
differences, producer-only entries, deterministic samples, and an omitted-sample count. The
Markdown and HTML reports render those diagnostics without publishing the combined explorer.

The generated report identifies the original `todoClient.js` mismatch precisely and identifies
the browser-only React import bindings before sampling later column shifts in the hooks.

### Minimal reproduction

[`../reproductions/vitest-cross-transform-coverage/`](../reproductions/vitest-cross-transform-coverage/)
is a self-contained pinned fixture. `npm run reproduce` asserts both observed cases:

- an imported direct call maps to column 20 under Node SSR and column 21 in the browser;
- a named React import produces one browser-only statement mapped to the import line.

The reproduction records the transformed snippets, relevant SSR mapping, complete minimal
statement maps, and why counter-ID or one-column normalization is unsafe.

### Trusted-clock design experiment

The prototype extracted `trustedClock.js` behind an internal interface that owns server-time
adoption, half-round-trip adjustment, the projected calendar day, midnight scheduling, today
subscriptions, ULID minting, and timer cleanup. `createTodoClient` keeps its external interface and
continues to own transport, optimistic state, outbox delivery, rehydration, and stream lifecycle.

| Architecture | Evidence | Decision |
| --- | --- | --- |
| Better: smaller interface and stronger clock/timer locality | Still incompatible: the imported-call shift split across `todoClient.js` and `trustedClock.js` | Retained for module depth; combined automation remains withheld |

After the split, `todoClient.js` has one statement-location mismatch across 200 statements and
`trustedClock.js` has one across 43 statements. Functions and branches match exactly in both
files. No local canonicalization was attempted because the minimal reproduction confirms that the
structural React-import case cannot be handled by a general counter or column heuristic.
