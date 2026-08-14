# Fresh-session handoff: Istanbul coverage provider migration

Date: 2026-08-12

## Fresh-session objective

Implement a separate, reviewable migration of both coverage producers from Vitest's V8 provider
to Vitest's Istanbul provider. The migration should make the optional combined Node and Storybook
automation view available without weakening exact executable-map compatibility or changing who
owns coverage verdicts.

Use the existing reproduction as an executable regression fixture. Record provider identity and
version in producer evidence and baseline provenance. Treat all tuple changes caused by the
provider switch as a reviewed contract migration, not as coverage improvements or regressions.

Expected end state:

```text
13 overlapping Node and Storybook files
0 incompatible executable maps
Combined automation reach: available
coverage/index.html: published
Owner-specific Node and Storybook verdicts: still authoritative
```

Do not attempt local executable-map canonicalization unless the real repository still produces
incompatible maps after both producers use Istanbul.

## Start here

Read these files before changing code:

- [`AGENTS.md`](../../AGENTS.md)
- [`docs/adr/006-test-execution-model.md`](../adr/006-test-execution-model.md)
- [`docs/adr/010-producer-owned-coverage-evidence.md`](../adr/010-producer-owned-coverage-evidence.md)
- [`docs/testing-and-validation.md`](../testing-and-validation.md)
- [`docs/coverage-evidence-audit.md`](../coverage-evidence-audit.md)
- [`combined-automation-map-compatibility-handoff.md`](./combined-automation-map-compatibility-handoff.md)
- [`../reproductions/vitest-cross-transform-coverage/README.md`](../reproductions/vitest-cross-transform-coverage/README.md)
- [`scripts/coverage-producer-cli.mjs`](../../scripts/coverage-producer-cli.mjs)
- [`scripts/coverage-producers.mjs`](../../scripts/coverage-producers.mjs)
- [`scripts/coverage-evidence-cli.mjs`](../../scripts/coverage-evidence-cli.mjs)
- [`scripts/coverage-evidence.mjs`](../../scripts/coverage-evidence.mjs)
- [`scripts/stages.mjs`](../../scripts/stages.mjs)
- [`vitest.config.mjs`](../../vitest.config.mjs)
- [`frontend/vitest.storybook.config.js`](../../frontend/vitest.storybook.config.js)

Use TDD for the provider-provenance contract, baseline migration behavior, and reproduction
extension. Use Node 22 through `mise exec node@22 --` for all repository commands.

## Repository and worktree state

The producer-owned coverage implementation is committed through:

```text
3ce3c1ea82ecb7454b9c8a16baf10373507dcf73
```

There are intentional uncommitted results from the completed diagnostic handoff. Preserve and
review them rather than rebuilding or discarding them:

```text
 M coverage-baseline.json
 M docs/coverage-evidence-audit.md
AM docs/plans/combined-automation-map-compatibility-handoff.md
 M frontend/src/todos/todoClient.js
 M frontend/src/todos/todoClient.test.js
 M scripts/coverage-evidence.mjs
 M scripts/coverage-evidence.test.mjs
 M scripts/coverage-producers.mjs
 M scripts/coverage-producers.test.mjs
 M scripts/source-evidence-registry.mjs
 M scripts/source-evidence.test.mjs
?? docs/reproductions/
?? frontend/src/todos/trustedClock.js
?? frontend/src/todos/trustedClock.test.js
```

The diagnostic work provides:

- bounded executable-map incompatibility diagnostics;
- a pinned, self-contained V8 cross-transform reproduction;
- a retained `trustedClock.js` extraction that improves module depth independently of coverage;
- a properly generated owner baseline for that extraction.

Before mixing in the provider migration, inspect and verify this work. Prefer a separate checkpoint
or commit so the architecture and diagnostic changes remain reviewable independently from the
provider and baseline migration.

Ignored `.coverage-reports/node` and `.coverage-reports/storybook` files may contain reports from
the Istanbul experiment described below. Recollect reports before drawing any conclusion from
them.

## What the investigation proved

The current V8 incompatibility is not evidence that production source lines differ. Node SSR and
browser Vite transformations produce different generated code and source maps before
`ast-v8-to-istanbul` reconstructs executable locations.

The retained minimal reproduction proves two distinct cases under the V8 provider:

1. An imported call maps one column differently after the SSR direct-call wrapper.
2. A named React import gains a browser-only executable statement for a generated CommonJS
   interop binding.

This makes counter-ID merging and one-column normalization unsafe.

## Proven migration hypothesis

The same minimal sources were collected with `@vitest/coverage-istanbul@4.1.10`. For both files,
the complete `statementMap`, `fnMap`, and `branchMap` were byte-for-byte equal between Node and
browser producers.

Minimal result:

```text
imported-call.js
  statementMap: MATCH
  fnMap: MATCH
  branchMap: MATCH

named-react-import.js
  statementMap: MATCH
  fnMap: MATCH
  branchMap: MATCH
```

The migration was then tested temporarily against the real repository by collecting Node and
Storybook coverage with Istanbul. The temporary tracked config edit was restored and temporary
no-save dependency installs were removed afterward.

Real-repository result:

```text
overlap files=13, incompatible=0
combined automation status=available
```

The experimental combined automation tuple was:

```text
statements 1122/1147
branches    503/548
functions   275/281
lines      1001/1011
```

These values are evidence that the approach works, not baseline values to copy. Recollect them
after the real migration and let the canonical baseline writer generate all persisted tuples.

## Why Istanbul fixes this class of mismatch

The V8 provider instruments transformed runtime code and maps its ranges back to the original
source afterward. Node SSR and browser transforms can therefore produce different executable
maps for identical source.

The Istanbul provider instruments against the original-source transform pipeline before those
environment-specific runtime forms become coverage identity. The experiment shows that this
produces the same executable identity for both producers in this repository.

This does not justify weakening compatibility checks. Exact source digests and exact executable
maps should remain prerequisites for the optional combined view.

## Implementation increment 1: freeze the reproduction contract

Extend [`docs/reproductions/vitest-cross-transform-coverage/`](../reproductions/vitest-cross-transform-coverage/)
so one canonical command proves both sides of the decision:

- V8 reproduces the imported-call column shift and browser-only React import statement.
- Istanbul produces exact statement, function, and branch maps for both cases.

Pin `@vitest/coverage-istanbul` to `4.1.10` in the reproduction. Prefer explicit V8 and Istanbul
configs or scripts over a hidden environment-dependent default. The comparison script should fail
if either the V8 incompatibility disappears unexpectedly or the Istanbul compatibility regresses.

Keep the fixture self-contained and avoid depending on the repository's root installation.

## Implementation increment 2: make provider provenance a contract

Producer evidence currently proves revision, cleanliness, config digests, source digests, and
coverage artifacts. Add the coverage provider identity and resolved version.

A suitable conceptual shape is:

```json
{
  "coverageProvider": {
    "name": "istanbul",
    "package": "@vitest/coverage-istanbul",
    "version": "4.1.10"
  }
}
```

Requirements:

- Resolve the installed package version rather than duplicating it as an unchecked string.
- Validate that the Node and Storybook manifests declare the expected provider.
- Validate that provider identity and version are compatible before combining automation maps.
- Detect root versus frontend dependency skew.
- Include provider provenance in the generated evidence report.
- Include provider provenance in baseline metadata so a future provider switch cannot masquerade
  as an ordinary tuple change.
- Update schemas deliberately and test unsupported or missing metadata.

The Storybook producer actually executes with the frontend installation, so do not accidentally
record only the root package version for both producers without checking the frontend package.

## Implementation increment 3: switch both producers

Replace the pinned V8 provider dependency with the pinned Istanbul provider in both package roots:

```text
package.json
frontend/package.json
```

Switch both coverage configurations:

```text
vitest.config.mjs
frontend/vitest.storybook.config.js
```

Target dependency and provider:

```text
@vitest/coverage-istanbul 4.1.10
provider: 'istanbul'
```

Update lockfiles through npm. Do not leave both provider packages installed without a documented
runtime reason. Update documentation that calls the collected percentages specifically "V8"
where it now describes the active system. Preserve historical V8 language in the reproduction and
root-cause record.

Watch for a Vite native config-loader warning observed during the temporary experiment:

```text
Your Vite config uses features unsupported by configLoader native:
ESM syntax in file loaded as CommonJS
```

Do not suppress the warning. Identify the config path and correct its module boundary if the
warning remains after the real dependency migration.

## Implementation increment 4: reviewed baseline-provider migration

The coverage baseline is a lockfile and must only be written by:

```bash
mise exec node@22 -- npm run coverage:update-baseline
```

Changing providers can legitimately change many exact tuples. Do not classify those changes as
improvements, regressions, or drift against a baseline produced by a different provider.

Design an explicit reviewed migration path with these properties:

- Check mode fails clearly when current producer provider provenance differs from the baseline.
- Ordinary update mode does not silently replace tuples across a provider change.
- A deliberate review signal allows the canonical `coverage:update-baseline` command to write a
  fresh provider-specific contract.
- The generated baseline records the new provider identity and version.
- Removing or changing the review signal after migration restores strict ordinary behavior.

One possible interface is:

```bash
COVERAGE_EVIDENCE_REVIEW_PROVIDER=1 \
  mise exec node@22 -- npm run coverage:update-baseline
```

The exact interface may change if a clearer reviewed contract fits the existing ownership-review
pattern. It must remain explicit, tested, documented, and use the canonical baseline command.

Do not manually edit `coverage-baseline.json` and do not copy the experimental tuples above.

## Implementation increment 5: combined explorer and stability admission

After the real migration:

1. Recollect both producers from scratch.
2. Assert all 13 overlapping files have exact source digests and executable maps.
3. Assert `createCombinedAutomationReach` returns `available` with no incompatible files.
4. Assert the combined Istanbul explorer at `coverage/index.html` is published.
5. Assert the Markdown and HTML evidence reports link the explorer.
6. Assert owner-specific verdicts still use only their registered producer tuples.
7. Assert withholding and artifact deletion still work for a synthetic incompatibility test.

The canonical browser verification includes ten independent Storybook collections. Once the
migration is at a clean revision, run the strict admission command as well:

```bash
mise exec node@22 -- npm run coverage:check-storybook-stability
```

All ten collections must have identical Storybook evidence under Istanbul. Do not reduce the run
count or weaken the clean-revision requirement.

## Test sequence

Start with focused red tests:

```bash
mise exec node@22 -- npm run verify unit
```

Then exercise both producers and the evidence evaluator:

```bash
mise exec node@22 -- npm run verify unit storybook coverage
```

Run the reproduction from its own directory using its pinned installation and documented command.

After the provider-specific baseline is reviewed and generated, run:

```bash
mise exec node@22 -- npm run coverage:check-storybook-stability
mise exec node@22 -- npm run verify
```

Paste the final verification row table verbatim. If the migration is split into commits, keep the
diagnostic and trusted-clock checkpoint separate from the provider-provenance and baseline
migration commit.

## Decision rules

Keep these boundaries intact:

- Producer ownership determines verdict authority. Cross-environment execution remains
  informational.
- Exact executable-map equality remains the compatibility rule.
- The combined automation view is all-or-nothing across compatible overlapping files.
- Provider provenance is evidence, not a label inferred from filenames.
- A provider migration justifies a reviewed fresh baseline, not selectively favorable tuples.
- The trusted-clock extraction stands or falls on module quality, not coverage compatibility.
- If Istanbul leaves any real incompatibility, investigate that exact residue before considering
  AST-based canonicalization.

## Definition of done

- The reproduction proves V8 incompatibility and Istanbul compatibility.
- Both repository producers use the same pinned Istanbul provider.
- Producer manifests and the baseline record verified provider identity and version.
- Provider mismatch and dependency skew fail with actionable diagnostics.
- The provider migration uses an explicit reviewed baseline path through
  `npm run coverage:update-baseline`.
- All 13 real overlapping files have exact executable maps.
- Combined automation is available and `coverage/index.html` is published.
- Owner-specific verdict authority is unchanged.
- The ten-run Storybook stability admission passes at one clean revision.
- Full canonical verification passes with no warnings.

## Implementation outcome

Status: implemented on 2026-08-12.

- The canonical reproduction proves both V8 incompatibilities and exact Istanbul executable-map
  compatibility for both minimal cases.
- Node and Storybook use `@vitest/coverage-istanbul` 4.1.10 through one shared provider contract,
  while resolving and recording their actual root and frontend installations independently.
- Producer manifests use schema 2 and the generated owner baseline uses schema 3 with provider
  provenance. Missing metadata, stale evidence, and producer version skew fail closed.
- Normal check and update modes reject a provider change. The reviewed migration was generated
  only through `COVERAGE_EVIDENCE_REVIEW_PROVIDER=1 npm run coverage:update-baseline`.
- All 13 overlapping repository files have exact source digests and executable maps. Combined
  automation is available at `coverage/index.html`; owner-specific verdict authority is unchanged.
