# ADR 006: How tests are run

- Status: Accepted
- Date: 2026-08-05
- Scope: Command surface, execution stages, coverage gating, Node version
- Supersedes in part: [ADR 005](./005-testing-and-storybook.md) (coverage gate, a11y mode)

## Context

The repo proved behaviour in five places through four different runners, and offered eight
`test`-shaped npm scripts across four `package.json` files with no rule for which to type.
`shared` and `backend` used `node:test`, frontend logic used Vitest with happy-dom, stories used
Vitest in real Chromium, journeys used Playwright, and Lighthouse stood alone. Nothing said when
any of them should run.

Two claims in ADR 005 were not true of the code:

- It said CI gates near-100% coverage on the non-UI seams. **No coverage script, config, or
  threshold existed anywhere**, and several of those seams would not have passed one.
- It said a11y would move from `'todo'` to `'error'` once the story inventory was green. The
  inventory was green; the flip had not happened, so a11y violations could not fail a build.

Measured on Node 22, the whole suite is fast: static checks ~4s, all Node and happy-dom tests
~2s, Storybook ~13s, Playwright ~11s, build + Lighthouse ~40s. About 70 seconds end to end.
Nothing here justifies an elaborate pyramid of partial commands.

## Decision

### Two tiers, named for the occasion

| Tier | Command | When | Cost |
| --- | --- | --- | --- |
| Ambient | `npm run watch` | left open while working | ~2s per change |
| The gate | `npm run verify` | before commit, and whenever "are we green?" | ~70s |

There is no middle tier. A middle tier is what creates the "which one do I run?" question that
this ADR exists to delete.

### `verify` is four stages

Each stage is named for **what has to exist before it can run**. Cost ordering is a consequence
of that definition rather than a second thing to remember.

| Stage | Steps | Nothing runs until | Time |
| --- | --- | --- | --- |
| `static` | typecheck, lint, diagrams, audit | - (nothing executes) | ~4s |
| `unit` | shared, backend, frontend logic, scripts | Node | ~2s |
| `browser` | storybook, e2e | real Chromium | ~24s |
| `quality` | build, lighthouse, coverage | a production bundle | ~40s |

**Fail fast between stages, collect every failure within a stage.** A stage that fails stops the
ones after it because their results would no longer mean anything: broken types make test
failures derived, broken logic makes journey failures derived, a misbehaving app makes its
Lighthouse score meaningless. Within a stage nothing invalidates anything else, so all of it runs
and you get the whole list in one pass instead of one round trip per problem.

`lint` runs with `--fix` first, so a nit fixes itself rather than blocking the other three stages.
This is the one check in `static` that does not truly invalidate anything downstream, and
autofixing is what stops that asymmetry costing a whole run.

### One runner for everything that does not need a browser

`shared` and `backend` moved off `node:test` onto Vitest. Only the runner import changed; the
assertions are still `node:assert/strict`, which Vitest reports natively. `watch` is therefore a
single Vitest process over four projects with real cross-workspace change detection, and there is
one assertion style to read instead of two.

`vitest.config.js` at the root lists four projects, each pointing at a config inside its own
workspace so it resolves its own dependencies. This repo installs per workspace rather than
through npm workspaces. The frontend entry names `frontend/vitest.logic.config.js` rather than
`frontend/vitest.config.js`, for the reason in the next paragraph.

**The `storybook` project is deliberately not in that list.** Under the root Vitest process it
resolves `frontend/node_modules/@vitest/browser` while the runner is the root's own copy, and the
run stalls partway through the story files (reproduced twice, 4 of 12 files then no progress for
minutes). Run from `frontend/`, the same config file finishes in ~13s. So `verify browser`
launches it there. The cause was not isolated further; the duplicate install is the strong
circumstantial explanation, and converting to npm workspaces would remove it.

This does not weaken the "one runner" decision. The goal was one watch loop and one assertion
style, not literally one process - `verify` already orchestrates eslint, tsc, Playwright and
Lighthouse and presents one verdict.

**Three config files in `frontend/`, because the Storybook UI starts its own Vitest.** Pressing
run in the Storybook test addon does not call `verify`; it starts Vitest itself, and it finds the
config by scanning upward for a `vitest.workspace.*`, `vitest.config.*` or `vite.config.*` whose
contents mention `@storybook/addon-vitest`, taking that file's directory as the Vitest root and
then filtering for a project named `storybook:<configDir>`. `vitest.storybook.config.js` is not a
name it scans for, so it fell back to the happy-dom logic config, found no such project, and died
with `No projects matched the filter`. Interactive runs were broken while `verify browser` stayed
green, because only `verify` passes `--config` explicitly.

| File | Who loads it |
| --- | --- |
| `vitest.logic.config.js` | the root process, as the `frontend` project |
| `vitest.storybook.config.js` | `verify browser`, by explicit `--config` |
| `vitest.config.js` | the Storybook addon, which can find no other name; it only names the other two |

The addon renames the browser project to `storybook:<configDir>` itself when it sets
`VITEST_STORYBOOK`, so the name is not ours to maintain. What matters is that the root process
still reaches the logic project **without** going through the file that names the browser project,
which is why the root config points at `vitest.logic.config.js` directly. Reproduced both ways:
deleting `frontend/vitest.config.js` restores the original error at the same stack frame, and
restoring it runs all 51 story tests under the addon's own filter.

### Coverage is collected in `unit` and `browser`, judged in `quality`

A coverage drop invalidates nothing downstream, so it must not be allowed to block the browser
stage. But the data has to be gathered while tests run. Both runs therefore write Vitest blob
reports into `.vitest-reports/`, and the `coverage` step merges them with `--mergeReports` and
judges the merged result.

Merging is not a convenience. `fakeDatomServer` measures **90.4%** from its unit test and
**99.3%** from the stories that run against it; merged it reaches 100% statements. Judging the
unit run alone would understate it and push someone into writing redundant unit tests for lines
the stories already prove.

Only non-UI seams are gated. Components are judged by story states, play functions and a11y, as
ADR 005 says. **The rule is the file extension: `.js` is logic and is gated, `.jsx` is a component
and is not.** The include list is globs rather than filenames, so a new logic file is gated the
day it is written instead of the day someone remembers to add it. An earlier filename list had
already gone wrong: it gated a four-line helper while missing `todoClient.js`, the largest and
most stateful logic file in the repo, despite ADR 005 naming "client/protocol helpers".

Two files are excluded because they are structurally unmeasurable here: `shared/src/types.js` is
pure JSDoc typedefs with no runtime code, and `backend/src/index.js` is the process bootstrap that
e2e proves in a process v8 cannot see from inside Vitest.

Individual unreachable statements are marked at the code site with `/* v8 ignore next */` and a
comment saying why, rather than by lowering a threshold. The bar is deliberately high: only code
that cannot be reached without replacing the thing under test qualifies. Two statements meet it -
the ULID overflow throw, which needs all 80 random bits at maximum inside one millisecond, and the
journal's zero-progress write guard, which needs a stubbed file handle. Everything else that looks
defensive is merely untested, and belongs in a test.

`ignoreEmptyLines` is on. Without it v8 counts comment lines inside an uncovered region as
uncovered statements, so documenting why a branch is unreachable makes the number worse. That was
measured, not assumed: annotating the ULID throw dropped the file from 98.16% to 96.39% before
this was enabled, and it reads 99.13% after.

**The thresholds in `vitest.config.js` are a lockfile, not a target.** The target is 100%
statements, lines and functions with 90% branches. The committed numbers are what the suite
proves today, so the gate lands green and can only ratchet upward. Raising them is deferred work.

Vitest applies the global floor to every file, including files matched by a glob key - a glob can
only raise a file, never exempt it. So the global numbers sit at the weakest file and each glob
entry pins a stronger file at what it already achieves. Without those entries a file at 100%
could slide to 85% unnoticed, which is exactly how coverage becomes a vanity number.

Thresholds are enabled only when `COVERAGE_GATE=1`, which the `coverage` step sets. Every other
run collects coverage without being judged against floors calibrated for the merged report.

### A diagram must not describe more than it renders

`diagrams` parses every fenced `mermaid` block in the repo's Markdown and fails on a node carrying
more than one self-transition. Mermaid renders **only the last one**: the earlier edges vanish from
the SVG with no warning and no parse error, so the diagram renders, looks right, and describes less
than its source. Measured against mermaid 11.15 in a real browser, `a-->a: ALPHA` followed by
`a-->a: BETA` renders BETA alone, while three parallel `a-->b` edges all survive. Self-loops
collapse; parallel edges between different nodes do not.

This is a static check with no browser and no Mermaid dependency, because the failure is a property
of the source, not of the render. It exists because the state diagrams in
[ADR 007](./007-ui-to-model-convention.md) lost an edge this way twice, and a wrong diagram is worse
than no diagram: it is believed. The fix is never to delete the edge, but to merge the labels where
they are really one transition, or move one onto a `note`.

Same idea as the two checks below: make the safe thing the default and a mistake loud, rather than
relying on someone re-reading the rendered output.

### Proof must not be able to vanish quietly

A component with no story is proven by nothing: no play function and no axe pass of its own. That
is not hypothetical - `TodoRow.stories.jsx` was deleted in one commit and every gate stayed green.

`frontend/src/testing/storyCatalog.test.js` therefore asserts that every `.jsx` under `src/` is
either storied or named in `PRESENTATIONAL_PRIMITIVES` with the reason it owns no user-visible
state. `TodoRow` is the one entry: a `role="group"` div with flex styles whose accessible name
comes from `TodoItem` and `TodoComposer`, both of which have stories. The test also fails on stale
exemptions and on exemptions for components that do have a story, so the list cannot rot.

This is the same idea as the glob-based coverage include: make the safe thing the default, and
make a deliberate exception loud rather than silent.

### The gates that were only aspirations

- **a11y**: `parameters.a11y.test` is now `'error'`. Verified green across all stories at no
  measurable cost before flipping. The `color-contrast` narrowing for MUI outlined inputs is now
  load-bearing, which means contrast on those inputs is deliberately unverified.
- **audit**: `npm audit --audit-level=high` in all four install roots. High and critical fail;
  moderate and low are printed and do not. `--audit-level` already splits on severity, so no
  production/dev partition is needed. An unreachable registry is reported as `SKIP`, never as a
  failure: no network means "unknown", the lockfiles have not moved, and CI re-checks with a
  network on every push.

### Node 22, asserted rather than assumed

`.nvmrc`, `mise.toml`, CI and `engines` all say 22, and CI reads `.nvmrc` so they cannot drift
apart again. Previously the pins said 22 while CI ran 24.

`verify` and `watch` compare `process.version` against `.nvmrc` and refuse to run on a mismatch.
mise does not activate in non-interactive shells, so without this check an agent or a script
silently runs a different Node than the one the repo claims.

### The command surface

Top-level scripts are the things you type. Stages and steps are arguments, not scripts.

```
npm run watch                 ambient loop, one GREEN/RED banner
npm run verify                all four stages
npm run verify browser        one stage
npm run verify lint e2e       any mix of stages and steps
npm run verify help           the stage/step map
npm test                      the same as verify
npm run lint | typecheck      kept because they are ecosystem-conventional
npm run storybook             the component loop, with HMR
npm run preview               the demo driver
npm run kill                  frees every port this repo binds
```

Deleted: `test:shared`, `test:backend`, `test:frontend`, `test:quality`, `test:e2e`,
`quality:lighthouse`, `check:declarations`, and the per-workspace `test`, `test:watch`,
`test-storybook`, `lint` and `kill` scripts. Names that mean the same thing in every repo survive;
names invented here do not.

The same rule keeps `build:types`. It is ecosystem-conventional, `postinstall` and `typecheck`
both call it, and regenerating the shared package declarations for editor tooling without paying
for a full typecheck is a real use. `check:declarations` had none of that - one caller, a name
invented here - so it is inlined into `typecheck`.

`shared/` is not installed separately. The root depends on it through a `file:` link, so its
dependencies land in the root tree; this was verified by deleting `shared/node_modules` and
watching `typecheck` and all 35 shared tests still pass. CI and the README install three trees,
not four.

There is no `watch:stories`. Vitest watch over stories did not re-run on edit when probed, and the
component loop is `npm run storybook` with HMR plus `verify browser` for the assertions.

**CI is one step: `npm run verify`.** Not "CI runs the same checks" but the same file in the same
order, so a green local run cannot be surprised by a red build.

## Consequences

- One place answers "what tests what": `npm run verify help`, generated from the same table
  `verify.mjs` executes, so it cannot drift from behaviour.
- Coverage is real for the first time, and starts honest rather than aspirational.
- `npm run lint` now modifies files, because `verify` autofixes before judging.
- The coverage lockfile has one entry per gated file and needs updating as coverage improves. That
  verbosity is the price of making regressions impossible; it collapses to a flat 100/90 once the
  deferred work lands.
- Root now installs `vitest`, `@vitest/browser`, `happy-dom` and `eslint`, duplicating versions
  already present in `frontend/`. They must stay in lockstep. Converting to npm workspaces would
  remove both the duplication and the Storybook-under-root stall.
- Both the root and `frontend/` override `glob` to `^13` - they install `@vitest/coverage-v8`
  separately, so overriding only the root left the warning coming from the frontend tree.
  `@vitest/coverage-v8` depends on `test-exclude`, which
  pins `glob ^10`, and glob's maintainer marks every version except the newest as deprecated - so
  a clean `npm ci` printed a scary deprecation notice. `npm audit` reports no advisory against the
  version actually installed, so this was noise rather than risk, but noise in `npm ci` output is
  how real warnings get ignored. Coverage reports byte-identical numbers on glob 13, which is what
  makes the override safe. Drop it once vitest ships a `test-exclude` that tracks glob itself.
  Note that npm rejects comment keys inside `overrides`, which is why this explanation lives here.

## Deferred

**Close the behaviour gaps the widened gate exposed.** These are real paths with no proof, not
percentage chasing:

| Where | Unproven behaviour |
| --- | --- |
| `todoClient.js` `reconnect()` | Never executed. It is wired to the real Reconnect button in `StatusBar.jsx`, but StatusBar stories pass a fake runtime, so the button is proven and the implementation is not |
| `todoClient.js` server rejection | A rejected datom shows "The server rejected a change"; never produced in any test |
| `selectors.js` `details` branch | The same failure seen from the StatusBar model side |
| `todoClient.js` outbox retry | The retry timer after a failed drain |
| `backend/src/app.js` | The 500 handler; the API's generic error path has never run |
| `backend/src/seed.js` | `createSeedTodoLists` is never called - every test passes an explicit seed, so the default seed is unproven |
| `backend/src/config.js` | Config parse and validation failure paths |

**Then raise the coverage lockfile to the 100/100/100/90 target.** Most of it falls out of the
table above; the remainder is `calendarDate.js` leap-year branches and `ulid.js` functions.

**Measure test strength, not just reach.** Coverage cannot tell a constraining assertion from a
vacuous one, which is the failure mode of quickly written tests. Two mechanisms are proposed and
not yet evaluated:

- **Mutation testing** (Stryker), scoped first to `shared/src` and `todoClient.js`. DECISIONS.md
  says this model fails silently when it is wrong - a datom not broadcast, a tombstone not
  retained, a cursor that skips. A surviving mutant is proof that a line runs unchecked, which is
  exactly that class of bug. Cost and survival rate are unmeasured; a scoped spike should come
  before any commitment.
- **Property-based testing** (fast-check) for the invariants examples can only sample: last-write-
  wins making the fold order-independent over any permutation, ULID monotonicity across arbitrary
  clock sequences, and journal replay determinism.

**Decide whether to adopt npm workspaces.**
