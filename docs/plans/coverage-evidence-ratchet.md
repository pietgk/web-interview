# Implementation plan: trustworthy coverage evidence and ratcheting

Status: Ready for implementation in a fresh session.

## Objective

Make the merged coverage result trustworthy for people, coding agents, and CI before adding new
coverage-driven tests. Replace rounded, manually maintained per-file percentage thresholds with an
exact generated baseline; make any baseline movement deliberate; and publish coverage with the
same visibility and retention as Lighthouse.

This slice changes the ruler, not the measured production behaviour. Selecting and adding the
next behavioural test happens after this work is green and its report has been inspected.

## Why this is next

The current gate is green, but its evidence has three trust gaps:

1. Whole-number thresholds permit small regressions and several entries no longer preserve what
   the suite proves.
2. Istanbul's top-level directory rows contain only direct files. For example, `backend/src` is
   `app.js + config.js + seed.js` at 151/171 statements, while a separately calculated recursive
   backend total is 518/538. Both are correct, but the report does not label the distinction.
3. `coverage/` is ignored and its HTML has no Git revision or dirty-state provenance. A stale
   local report looks current, and CI uploads Lighthouse reports but discards coverage details.

The current global merged result is 2149/2173 statements, 549/571 branches, 150/152 functions,
and 2140/2164 lines. These are orientation totals only. The gate remains per-file.

## Confirmed policy

**Better evidence** means every reachable, behaviour-bearing path has deterministic proof at the
appropriate layer, every unreachable path has a local justification, and important assertions are
eventually sampled with mutation testing. Coverage proves reach, not assertion strength.

**Per-file results are canonical.** Global and workspace totals help navigation but never offset a
weaker file. Every aggregate must say whether it counts direct children or recursively includes a
workspace.

**The ratchet has two dimensions.** For every metric in every gated file:

- `current.total - current.covered` must not exceed the baseline uncovered count;
- `current.covered / current.total` must not be less than the baseline proportion.

Compare proportions by cross multiplication, not rounded decimal percentages. Treat a metric with
zero total items as 100%. A failure in one dimension, metric, or file cannot be offset elsewhere.

**The committed baseline must equal a normal passing report.** Any tuple change makes ordinary
verification fail. An explicit ratchet accepts only changes that satisfy both non-regression
invariants, rewrites the generated baseline, and leaves a reviewable diff. It refuses to lower the
bar. CI never updates the file.

## Module and seam

Create one deep coverage-evidence module under `scripts/`. Its small interface accepts a parsed
Vitest summary and parsed baseline, and returns a complete evaluation model. Behind that interface
it owns:

- repository-relative path normalization;
- file-set equality, including new and deleted gated files;
- exact tuple comparison and change classification;
- direct and recursive rollups;
- deterministic ordering;
- source provenance;
- Markdown and HTML rendering;
- check and ratchet decisions.

Keep filesystem access, Git inspection, environment variables, and process exit codes in a thin
CLI adapter at the process seam. Tests cross the module interface using in-memory fixtures. Do not
spread comparison rules between `vitest.config.js`, `verify.mjs`, and the workflow.

## Artifacts and interfaces

### Committed baseline

Add a generated root-level `coverage-baseline.json` containing:

- a schema version;
- normalized repository-relative file paths;
- exact `{ covered, total }` values for statements, branches, functions, and lines;
- an unambiguous generated-file notice.

Do not store a commit hash in the baseline because the file must exist before its commit does. The
runtime report owns provenance.

### Normal verification

The `coverage` step continues to merge the unit and Storybook blob reports. Vitest collects and
writes `coverage/coverage-summary.json` and its Istanbul explorer; the coverage-evidence CLI then:

1. evaluates the report against the committed baseline;
2. writes `coverage/summary.md` and `coverage/report.html` even when evaluation fails;
3. appends the Markdown to `GITHUB_STEP_SUMMARY` when present;
4. exits non-zero for regressions, file-set changes, or an unratcheted improvement.

Change the step's linked artifact from `coverage/index.html` to the canonical
`coverage/report.html`. That landing page links to `index.html` for line-level exploration.

The canonical report shows, in this order:

1. verdict and source state: full Git revision, dirty or clean, generation time, and merged scope;
2. global orientation totals;
3. recursive `shared`, `backend`, and `frontend` rollups, labelled **recursive**;
4. changes requiring action;
5. every gated file with current tuple, baseline tuple, uncovered count, proportion, and status;
6. a link to the Istanbul explorer and a short explanation of its direct-directory rows.

Use paths and counts as primary evidence. Percentages are derived display values, never the stored
contract.

### Explicit ratchet

Add `npm run coverage:ratchet`. It must regenerate unit and Storybook blobs in the same invocation,
merge coverage, refuse any regression, and update `coverage-baseline.json` only when all changes
are improvements under both invariants. It then produces the same canonical report against the new
baseline.

The command is intentionally separate from `verify`: verification observes repository state;
ratcheting mutates a reviewed contract. Never make ordinary local verification or CI rewrite the
baseline automatically.

### CI publication

After `Verify`, add an `if: always()` upload step for the complete `coverage/` directory:

- artifact name: `coverage-report`;
- retention: 14 days;
- missing files: warn, because an earlier failed stage legitimately prevents coverage generation.

Keep Lighthouse and coverage as separate artifacts. The coverage CLI owns the detailed workflow
summary; the workflow only uploads files.

## Implementation sequence

1. Add focused module tests for comparison, file-set changes, rollups, ordering, and rendering.
2. Implement the pure coverage-evidence module and thin CLI adapter.
3. Generate the initial exact baseline from a complete merged run.
4. Replace the manual per-file Vitest thresholds with the coverage-evidence check. Keep coverage
   inclusion, exclusions, reporters, and `ignoreEmptyLines` in `vitest.config.js`.
5. Integrate check and ratchet modes into `verify` and add `npm run coverage:ratchet`.
6. Make `coverage/report.html` the linked local artifact and add the detailed GitHub summary.
7. Upload `coverage/` in CI with the same retention as Lighthouse.
8. Update README instructions only after the commands and artifacts exist.
9. Run the full gate, inspect the HTML in a real browser, and reconcile every displayed total with
   `coverage-summary.json` before declaring the work done.

## Required tests

Exercise the module through its interface with fixtures covering:

- exact baseline match;
- an added uncovered item;
- removal of covered code while misses remain, which worsens proportion;
- removal of uncovered code, which improves both dimensions;
- addition of fully covered code, which is an improvement requiring ratcheting;
- one improved metric alongside one regressed metric, which must fail;
- new and deleted gated files;
- `0/0` metrics;
- stable repository-relative path and row ordering;
- direct-directory versus recursive rollups;
- Markdown and HTML escaping of paths and provenance;
- ratchet refusal on every kind of regression;
- normal-check failure on an otherwise valid but uncommitted improvement.

Run `npm run verify unit` after each implementation step. Because this work changes scripts and CI,
run the full `npm run verify` before completion and paste its summary verbatim.

## Documentation changes in the implementation slice

- Update README with the canonical local report, explicit ratchet command, aggregation semantics,
  and CI artifact retention.
- Keep ADR 006 as the testing and coverage reporting decision. Do not create another ADR for its
  implementation.
- ADR 008 already records the confirmed retained generic backend failure-containment contract.
- Do not add coverage terminology to `CONTEXT.md`; it is a product-domain glossary, and coverage is
  general engineering language.

## Non-goals

- Adding tests solely to increase coverage.
- Changing the gated `.js` seam or adding JSX line thresholds.
- Changing the 100% statements, lines, and functions direction or the branch-policy discussion.
- Adopting mutation or property-based testing in this slice.
- Testing the generic backend 500 path in this slice.
- Lowering a baseline to make verification pass.

## Follow-up after this slice

Use the canonical per-file report to select the first meaningful uncovered behaviour. The generic
backend `INTERNAL_ERROR` containment path is again a valid candidate because ADR 008 now retains
that contract, but it must compete on behaviour risk with default startup seeding and configuration
validation. Decide that ordering from the trustworthy report rather than from aggregate percentage
gain.

After the remaining meaningful reach gaps are classified, run a scoped mutation-testing spike over
`shared/src` and `todoClient.js` to measure assertion strength before adopting a mutation gate.
