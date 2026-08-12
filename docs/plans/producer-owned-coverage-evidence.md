# Implementation plan: producer-owned coverage evidence

Status: Ready for implementation in a fresh session.

This is the implementation handoff for evolving the current merged Node + Storybook coverage
baseline into producer-owned evidence contracts. It consolidates the repository audit, the research
in [`docs/research/coverage-evidence-ownership.md`](../research/coverage-evidence-ownership.md), and
the subsequent review corrections.

The plan deliberately separates measured coverage facts, semantic module classification, and
unrelated code improvements. Coverage can show that a module needs review. Coverage alone cannot
decide which environment owns the module, whether its behavior is asserted meaningfully, or whether
the module should continue to exist.

## Fresh-session objective

Make the coverage verdict preserve evidence-producer identity:

- Node-owned runtime modules are compared only with fresh Node Vitest evidence.
- Storybook-owned React controller modules are compared only with fresh Storybook Chromium
  evidence.
- Rendered UI remains governed by story discovery, story execution, play assertions, and axe.
  Rendered-UI percentages remain informational, consistent with ADR 005.
- Non-owner execution may contribute to an optional compatible-union report, but cannot rescue an
  owner verdict.
- Every discovered source file has exactly one reviewed evidence treatment. Only appropriate
  instrumentable runtime modules have an exact coverage owner.

Do not begin by changing the authoritative verdict. First make the separate producer evidence
observable, audit the modules, record the decision, and prove browser stability.

Before editing, read:

- `AGENTS.md`
- this plan
- `docs/research/coverage-evidence-ownership.md`
- `docs/adr/005-testing-and-storybook.md`
- `docs/adr/006-test-execution-model.md`
- `docs/testing-and-validation.md`
- `docs/verify.md`
- `scripts/source-evidence.mjs`
- `scripts/source-evidence.test.mjs`
- `scripts/coverage-evidence.mjs`
- `scripts/coverage-evidence.test.mjs`
- `scripts/coverage-evidence-cli.mjs`
- `scripts/stages.mjs`
- `scripts/verify.mjs`
- `vitest.config.mjs`
- `frontend/vitest.logic.config.js`
- `frontend/vitest.storybook.config.js`
- `.agents/skills/domain-modeling/ADR-FORMAT.md` before writing the ADR

Preserve unrelated working-tree changes. Do not update `coverage-baseline.json` until the baseline
migration phase. Do not loosen any existing behavior, accessibility, source-accounting, coverage,
or verification gate.

## Existing implementation: do not rebuild

The repository already has most of the coverage infrastructure described by the research paper:

| Existing behavior | Current implementation |
| --- | --- |
| Exact statements, branches, functions, and lines per file | `coverage-baseline.json` and `scripts/coverage-evidence.mjs` |
| Regressions rejected | `evaluateCoverage` in `scripts/coverage-evidence.mjs` |
| Improvements require review before baseline update | check/update modes in `scripts/coverage-evidence.mjs` and `scripts/coverage-evidence-cli.mjs` |
| Source discovery and evidence accounting | `scripts/source-evidence.mjs` |
| Failure on an unclassified source path | `createSourceEvidence` issues and coverage verdict |
| Story declarations compared with executed stories | `scripts/source-evidence.mjs` |
| Failure when any executed story fails | `scripts/source-evidence.mjs` |
| Reviewed UI exemptions | `UI_COMPONENT_EXEMPTIONS` |
| Old report blobs removed before regeneration | `scripts/verify.mjs` |
| Coverage skipped when Node and Storybook cannot both run | `scripts/verify.mjs` |
| Revision, dirty state, time, and report scope | `sourceProvenance` in `scripts/coverage-evidence-cli.mjs` |
| Gated-logic and informational-UI report sections | coverage Markdown and HTML renderers |

The principal behavior change is replacing the exact baseline currently evaluated from merged
Node + Storybook evidence with exact baselines evaluated from each module's required producer.

## Confirmed policy target

### Evidence treatment is not coverage ownership

Every source file needs an evidence treatment, but not every source file should have an exact
coverage baseline.

| Evidence treatment | Required producer | Required verdict |
| --- | --- | --- |
| Node runtime logic | Node Vitest | Exact per-file owner baseline |
| Storybook React controller | Storybook Chromium | Exact per-file owner baseline |
| Rendered UI | Storybook Chromium | Story discovery, execution, play, and axe; coverage informational |
| Process or DOM bootstrap | Playwright | Relevant assembled-system journey |
| Test support | Its consuming test environment | Explicit accounting, not production coverage |
| Type-only source | TypeScript | Typecheck, no runtime coverage |

The registry may use concise treatment names, but their producer and verdict semantics must be
defined once in canonical code rather than copied into every entry.

### Rendered JSX does not get an exact tuple gate

Do not add an exact per-file coverage baseline to rendered UI. ADR 005 deliberately assigns
rendered UI to states, play functions, interactions, and accessibility rather than a line
percentage. A new ADR may supersede the merged-baseline portion of ADR 006, but must preserve this
ADR 005 decision.

React controllers may remain `.js` files and receive Storybook-owned exact baselines when their
natural interface requires React lifecycle or browser behavior. File extension is not the
classification rule.

### Cross-environment overlap remains allowed

One required producer means one source of coverage that can satisfy the gate. It does not mean
other suites must stop executing the module. Storybook may execute Node-owned logic, and E2E may
execute all layers. That overlap is useful integration evidence, but it cannot rescue the required
producer's verdict.

### Use precise combined-view names

Playwright does not currently emit compatible V8 source coverage, so Node + Storybook cannot be
called total production reach.

Use these concepts:

- **Combined owned runtime reach:** aggregate each coverage-owned file from its required producer.
  The source sets are disjoint, so this does not merge different maps for the same file.
- **Combined automation reach:** optional union of all compatible Node and Storybook evidence,
  including overlap. Withhold this view when map compatibility cannot be established.

The first view is the normal informational rollup. The second is optional and must never gate.

## Repository evidence motivating the change

The current authoritative coverage step runs `vitest --mergeReports=.vitest-reports --coverage`
and then evaluates one `logic-baseline`. This is intentional current behavior, not an accidental
implementation detail. `frontend/vitest.storybook.config.js` explicitly says Storybook coverage is
allowed to contribute to non-UI logic such as the fake datom server.

A diagnostic Node-only run found zero Node execution for these current baseline files:

| Module | Node statements | Current merged baseline statements | Meaning |
| --- | ---: | ---: | --- |
| `frontend/src/todos/useGhostComposer.js` | 0/19 | 20/23 | Reach currently comes from Storybook; ownership requires semantic review |
| `frontend/src/todos/useSettledText.js` | 0/41 | 43/52 | Reach currently comes from Storybook; ownership requires semantic review |
| `frontend/src/todos/useTodoLists.js` | 0/14 | 15/21 | Reach currently comes from Storybook; ownership requires semantic review |
| `frontend/src/todos/components/focusLeft.js` | 0/2 | 2/2 | Reach currently comes from Storybook; inspect the shallow helper and consumer |
| `frontend/src/todos/legacyReplica.js` | 0/7 | 7/7 | Storybook executes a browser migration side effect; do not infer its disposition from coverage |

These measurements establish producer attribution, not correct ownership. Do not automatically
reclassify, add tests, fold, or delete any of these modules from the table alone.

Node reported 233 statements for `todoClient.js`, while the merged report contained 234. Treat
that as a map-compatibility warning. It is not a confirmed incorrect merge until the normalized
Node and Storybook statement, branch, and function maps are compared directly.

## Guardrails for the implementation

- Do not infer ownership from `.js` versus `.jsx`, directory, filename, coverage percentage, or
  current consumer count alone.
- Do not add tests merely to reproduce a merged tuple under one producer.
- Do not treat the old merged baseline as the target for either new owner baseline.
- Do not edit ownership labels merely to regain green status.
- Do not let a coverage migration silently authorize production behavior changes.
- Do not delete or redesign ambiguous modules in the same step that classifies their evidence.
- Do not describe incidental execution as an asserted behavior.
- Do not add patch coverage or mutation testing in this effort.
- Do not add per-story attribution. Ordinary aggregate counters do not provide it.
- Do not carry evidence forward from an older source revision.

## Phase 1: producer reports without a verdict change

Goal: retain Node and Storybook coverage as independently inspectable evidence while the current
merged baseline remains authoritative.

### Implement

1. Preserve or generate separate coverage outputs for Node and Storybook under stable paths. Each
   producer needs:

   - an exact summary containing covered and total statements, branches, functions, and lines;
   - a full Istanbul coverage map containing statement, branch, and function locations;
   - producer identity;
   - source revision and dirty state;
   - a digest covering relevant production source plus the producer's coverage configuration.

2. Keep the existing merged report and baseline verdict unchanged during this phase.

3. Extend the canonical coverage report with clearly labeled read-only sections:

   - Node-only runtime reach;
   - Storybook controller reach, initially using candidate paths only and explicitly marked as
     provisional until the audit is accepted;
   - Storybook rendered-UI reach;
   - current merged-gate result.

4. Keep report generation deterministic. Generated timestamps and dirty state belong in report
   provenance, not in committed baselines.

5. Ensure a selective run cannot present stale producer evidence as current. Reuse the existing
   cleanup and skip behavior where it already satisfies this rule. Add only the missing digest
   validation rather than inventing redundant freshness machinery.

### Tests

- Producer reports retain distinct values for the same source path.
- A source/config digest mismatch is visible and prevents comparison.
- Existing cleanup and selective-run skip behavior remains unchanged.
- Existing merged verdict still governs.

### Done when

- One full verification run produces independently inspectable Node and Storybook summaries and
  maps.
- The existing authoritative coverage verdict has not changed.
- Reports identify producer and source state without implying that provisional classification is
  accepted policy.

Run `mise exec node@22 -- npm run verify unit` after each script step. Run the full gate before
calling the phase complete.

## Phase 2: semantic module audit

Goal: decide evidence treatment from each module's natural interface before encoding a registry.

### Audit method

For every discovered production source file, inspect:

1. The implementation.
2. All production consumers.
3. Existing tests and stories.
4. The observable behavior owned by its interface.
5. Whether that behavior inherently requires React lifecycle, DOM, accessibility, layout, a real
   browser, a process boundary, or only deterministic in-process execution.
6. Whether current coverage is direct evidence or incidental reach through another module.
7. Whether it is product runtime, bootstrap, migration, type-only, or test support.
8. Relevant ADRs, architecture documentation, and history when its purpose is transitional or
   unclear.

Record a proposed treatment and a concise rationale for every file. Mark uncertainty explicitly;
do not resolve it with a path default.

### Initial hypotheses that still require inspection

| Module | Hypothesis | Required investigation |
| --- | --- | --- |
| `useGhostComposer.js` | Storybook React controller | Confirm that React state/lifecycle is part of its observable interface and stories assert its rules |
| `useSettledText.js` | Storybook React controller | Confirm timing, cleanup, and prop-adoption behavior through browser-owned consumers |
| `useTodoLists.js` | Storybook React controller | Separate client lifecycle behavior from the legacy migration side effect |
| `focusLeft.js` | Rendered-UI helper or shallow module to fold | Inspect the consumer and decide whether the standalone interface earns its seam |
| `legacyReplica.js` | Undecided migration treatment | Establish deployment history and retained compatibility requirement before retain/redesign/delete decisions |
| `fakeDatomServer.js` | Likely Node-owned local adapter | Inspect its direct Node contract and uncovered behavior; do not demand the old merged tuple |
| `todoClient.js` | Likely Node-owned runtime logic | Confirm its natural interface and investigate producer-map differences separately |

### Separate code findings from coverage classification

The audit may reveal a code or product issue. Record it separately and do not change production
behavior as an incidental part of the coverage migration.

For `legacyReplica.js`, explicitly determine:

- whether an IndexedDB-backed version was ever deployed beyond developer browsers;
- whether those browser profiles still require cleanup;
- whether cleanup on every application mount is the intended meaning of the historical
  "one-time on boot" plan;
- whether Storybook should suppress the side effect or assert it intentionally.

If it is retained, redesigned, or deleted, handle that in a separately scoped bug/design change
with the appropriate end-to-end-first workflow. A behavior test does not make migration code
permanent; reviewed baseline file-set changes may remove it later.

### Done when

- Every production source has a reviewed proposed evidence treatment and rationale.
- Ambiguous files have explicit questions or decisions, not path-derived guesses.
- Unrelated code changes are listed separately and are not prerequisites unless they prevent an
  honest ownership decision.

This phase is review-only. If only documentation changes, run
`mise exec node@22 -- npm run verify static`.

## Phase 3: ADR 010

Goal: accept the producer-ownership policy before changing the gate.

Create `docs/adr/010-producer-owned-coverage-evidence.md` following the repository ADR format.
Keep it short and link to this plan and the living testing documentation for mechanics.

The decision must state:

- the exact baseline no longer merges producers for its verdict;
- Node-owned modules use only Node evidence;
- Storybook controller modules use only Storybook Chromium evidence;
- rendered UI percentages stay informational under ADR 005;
- every source has one evidence treatment, while only appropriate runtime modules have a coverage
  owner;
- overlap is allowed but cannot rescue an owner verdict;
- combined owned runtime reach is informational;
- combined automation reach is optional and withheld when maps are incompatible;
- ownership changes require architectural review;
- new source fails closed until classified;
- fresh owner baselines are a policy migration, not an improvement over merged tuples.

ADR 010 supersedes only the merged-baseline portion of ADR 006. Update the ADR index and pointers
without expanding the ADR into the implementation manual.

### Done when

- ADR 010 is accepted and linked from `docs/adr/README.md`.
- ADR 005's rendered-UI decision remains intact.
- `docs/testing-and-validation.md` describes the accepted policy without claiming the code already
  enforces later phases.
- `mise exec node@22 -- npm run verify static` passes.

## Phase 4: explicit reviewed evidence registry

Goal: replace semantic classification by broad path rules with explicit reviewed entries, while
retaining automatic source discovery.

### Design

Prefer a dedicated canonical module such as `scripts/source-evidence-registry.mjs` containing:

1. Treatment definitions that map each treatment to its required producer and verdict rule.
2. One explicit entry per production source path with treatment and rationale.

Keep filesystem discovery in the evidence evaluator. Discovery must compare the actual source set
with the registry and fail on:

- a discovered source with no registry entry;
- duplicate registry entries;
- a registry entry whose source no longer exists;
- a coverage-owned path absent from its owner's report;
- a baseline path not owned by that baseline's producer.

Do not repeat producer and verdict strings in every entry if the treatment definition can derive
them canonically. Do keep the per-file rationale explicit so a reviewer can evaluate the semantic
choice.

### Tests

- Every current production source has exactly one entry.
- A new unregistered `.js`, `.jsx`, or declaration source fails closed.
- Deleted and duplicate entries fail clearly.
- A file cannot appear in both owner baselines.
- Type-only, test-support, bootstrap, and rendered-UI files cannot enter an exact owner baseline.
- Ownership rationale appears in Markdown and HTML reports.

### Done when

- Path patterns discover source but no longer decide semantic ownership.
- The accepted audit is represented exactly in the registry.
- Existing story discovery, execution, exemption, and UI evidence behavior remains green.

Run `mise exec node@22 -- npm run verify unit` after each step and the full verification gate before
calling the phase complete.

## Phase 5: combined views and compatibility validation

Goal: report useful aggregate reach without letting incompatible maps corrupt a verdict.

### Combined owned runtime reach

Build this rollup by selecting each coverage-owned file from exactly its required producer and
summing its four metrics. Do not merge maps for the same file. This view is informational and
should be the normal combined headline.

Label numerator, denominator, source set, producer rule, and informational status in the report.

### Optional combined automation reach

For a file present in both Node and Storybook reports:

1. Require the same normalized source path.
2. Require the same source digest.
3. Compare normalized statement, function, and branch maps.
4. Merge hit counts only when the maps are compatible under an explicitly tested rule.
5. Withhold the optional union, name the incompatible files, and keep owner verdicts valid when
   compatibility cannot be established.

Investigate `todoClient.js` first because current Node and merged totals differ. Do not encode a
special-case exemption for it.

### Tests

- Owned rollups select the required producer even when the non-owner has higher coverage.
- Compatible maps union counters correctly.
- Different source digests cannot union.
- Different executable maps withhold the optional union and explain why.
- Withholding the optional union does not fail an otherwise valid owner verdict.
- Combined reports never claim to include Playwright source coverage.

### Done when

- Combined owned runtime reach is always available after valid owner reports.
- Combined automation reach appears only for compatible maps.
- No combined percentage participates in the authoritative verdict.

## Phase 6: fresh owner baselines

Goal: establish reviewed exact contracts from the correct producers without treating the migration
as an improvement or regression against merged tuples.

### Baseline shape

Use either two clearly named generated lockfiles or one generated lockfile with explicit producer
sections. The format must make accidental cross-producer comparison impossible. Keep statements,
branches, functions, and lines as exact covered/total tuples per owned file.

Normal verification must never rewrite the baselines. The baseline update command must:

- regenerate both required producer reports in one source state;
- refuse owner regressions;
- refuse unreviewed ownership/file-set changes;
- update only after the human has reviewed uncovered source and the ownership diff;
- never derive new tuples from the old merged baseline.

### Migration review

For each coverage-owned file:

1. Inspect the owner-only line explorer.
2. Review every uncovered statement and branch.
3. Add a behavior test only when the uncovered behavior deserves protection.
4. Accept reviewed incomplete coverage when additional execution would be artificial or
   meaningless.
5. Record the owner-only tuple as the new starting contract.

Deleting covered source, deleting an obsolete module, or changing the owned file set remains a
reviewable contract change. Coverage must not make dead code permanent.

### Done when

- Every Node-owned file has only a Node-derived tuple.
- Every Storybook-controller file has only a Storybook-derived tuple.
- Rendered UI, bootstrap, type-only, and test-support files have no exact tuple.
- Baseline diffs clearly show producer and file-set changes.
- The current merged baseline remains authoritative until Phase 8.

## Phase 7: browser stability admission

Goal: establish that exact Storybook-controller tuples are stable enough to gate.

At one clean revision with pinned Node, Vitest, V8 coverage provider, Playwright, Chromium, and
source configuration:

1. Run ten consecutive clean Storybook coverage collections.
2. Compare each controller's complete maps and exact four-metric tuples.
3. Require zero differences across all ten runs.
4. Repeat the stability check in CI or the environment that will enforce the gate.
5. Treat any variance as a blocker. Fix nondeterministic stories, timers, cleanup, or collection
   before activation; do not weaken the comparison.

Ten identical runs are an admission test, not proof that nondeterminism is impossible. Once the
gate is active, exact owner baselines continue detecting later variance.

Provide a finite repository command or script for this check. Do not require the human-only
`npm run watch` process.

### Done when

- The same revision produces identical controller maps and tuples across all admission runs.
- CI demonstrates the same result.
- A future maintainer can rerun the stability check with one documented finite command.

## Phase 8: contract tests and verdict cutover

Goal: activate producer-owned coverage only after every claim is executable.

### Test-gap audit first

Inventory the existing tests in `scripts/source-evidence.test.mjs`,
`scripts/coverage-evidence.test.mjs`, and verification-script tests. Do not duplicate coverage for
behaviors already proven, including basic unclassified-source failure, story-count checks, or the
existing partial-run skip.

Add tests for missing contracts:

- non-owner execution cannot rescue an owner regression;
- Node and Storybook baselines evaluate only their assigned files;
- owner improvement still requires reviewed baseline update;
- ownership changes cannot be hidden inside a baseline update;
- required producer evidence with the wrong digest fails;
- combined owned reach selects one producer per file;
- incompatible maps withhold only the optional automation union;
- rendered UI remains outside exact tuple gates;
- story discovery, execution, play, and accessibility protections remain independent.

### Cutover

1. Change the authoritative coverage step to evaluate Node and Storybook-controller baselines
   separately.
2. Remove the old merged baseline verdict only after the new verdict is green.
3. Preserve merged or union reporting only as informational evidence.
4. Update terminal headlines so each percentage names its source set and producer.
5. Update `coverage:update-baseline` to operate on both owner baselines without permitting
   regressions or unreviewed ownership changes.
6. Update `docs/testing-and-validation.md`, `docs/verify.md`, and relevant code comments to describe
   the implemented behavior exactly.

### Done when

- A Node-owner regression fails even when Storybook covers the lost item.
- A Storybook-controller regression fails even when Node happens to execute the item.
- Existing story, axe, E2E, build, Lighthouse, and source-accounting gates remain green.
- Combined percentages are visibly informational.
- The old merged tuple contract is removed rather than kept as a second competing gate.
- Full verification passes.

## Suggested implementation increments

Keep each increment independently reviewable:

1. Separate producer artifacts and report sections, no verdict change.
2. Semantic audit document, no production behavior changes.
3. ADR 010 and documentation pointers.
4. Explicit registry plus registry tests.
5. Owned rollup and optional compatibility-checked union.
6. Owner baseline format and migration review.
7. Browser stability command and admission result.
8. Verdict cutover and final documentation.

Do not combine an unrelated production cleanup discovered during the audit with these increments.

## Verification requirements

Follow the repository's command policy throughout:

- After each implementation step:
  `mise exec node@22 -- npm run verify unit`
- After touching Storybook or a rendered module:
  `mise exec node@22 -- npm run verify browser`
- After docs-only increments:
  `mise exec node@22 -- npm run verify static`
- Before claiming any implementation phase complete:
  `mise exec node@22 -- npm run verify`

Paste the final verification row table verbatim in the handoff. Never loosen a gate, skip a story,
edit a coverage tuple manually, or add an exclusion to make the migration pass.

## Deferred work

- Patch coverage policy
- Mutation testing
- Per-test or per-story coverage attribution
- Playwright V8 source coverage
- External coverage-service integration
- Production cleanup or redesign discovered during the semantic audit

These may be valuable later, but none is necessary to preserve producer identity in the current
coverage contract.

## Definition of done

The effort is complete when:

1. Every production source has one explicit reviewed evidence treatment.
2. Every coverage-owned runtime module has exactly one required producer.
3. Node-owned files gate only on fresh Node evidence.
4. Storybook-controller files gate only on fresh stable Storybook evidence.
5. Rendered UI remains protected by stories, plays, axe, and execution rather than exact tuples.
6. Non-owner execution cannot rescue an owner regression.
7. Combined owned runtime reach is informational and derived without overlapping-map merges.
8. Optional combined automation reach is withheld when coverage maps are incompatible.
9. Normal verification never rewrites reviewed baselines or ownership.
10. The full `mise exec node@22 -- npm run verify` gate is green.

