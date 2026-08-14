# Verify reference

Command and stage reference for this repo. The non-drifting list of what each stage runs is:

```bash
npm run verify help
```

It is generated from the same table `scripts/verify.ts` executes.

## Three stories, two daily commands

Watch, verify, and improve are three questions. Only the first two are daily commands. “Done”
is a green `verify`. Improve raises the contract on purpose; skipping it is correct when you are
not tightening.

| | Watch | Verify | Improve |
| --- | --- | --- | --- |
| Why | Stay in flow | Keep the promise | Raise the promise |
| When | Human terminal, left open | Before merge, CI, before an agent says done | When you choose to tighten |
| How | Typecheck and Node tests on save | `static` → `unit` → one Storybook collection and e2e → build, Lighthouse, lockfile | `coverage:update-baseline`, TypeScript / ESLint ratchets, Storybook admission when those tuples change |
| Done? | Never. Agents must not start it. | Yes. Same command locally and in CI. | The improvement is the commit. |

| Command | When | Cost |
| --- | --- | --- |
| `npm run watch` | left open while working | ~2s per change |
| `npm run verify` / `npm test` | before commit / CI | ~2m |
| `npm run coverage:update-baseline` | after reviewing a real coverage gain or owner change | the unit and Storybook collections that feed the lockfile |
| `npm run coverage:check-storybook-stability` | when raising Storybook owner tuples | ten collections against one Storybook process |

Agents must not start `watch` (it never exits). Docs-only changes may use `npm run verify static`;
anything under `shared/`, `backend/`, `frontend/`, `scripts/`, or `e2e/` needs a full green
`verify` before claiming done. See [`AGENTS.md`](../AGENTS.md). Do not add an agent rule that
improve is required for done.

## Stages (summary)

| Stage | Needs | Roughly |
| --- | --- | --- |
| `static` | nothing executes | typecheck, lint (autofix then judge), diagrams, audit |
| `unit` | Node | shared, backend, frontend logic, scripts |
| `browser` | real Chromium | Storybook play/a11y, Playwright e2e |
| `quality` | production bundle | build, Lighthouse, producer-owned coverage baselines |

Fail fast between stages; collect every failure within a stage. Selective runs:
`npm run verify browser`, `npm run verify lint e2e`, etc.

## Improve

Normal verification never rewrites the lockfile and never turns on a stricter compiler or lint
rule. Those changes are the commit. Typical improve work:

- Record a reviewed coverage gain or ownership change with `npm run coverage:update-baseline`.
- Turn on a stricter TypeScript or ESLint rule as its own pass, the way [ADR 011](./adr/011-typescript-source-language.md)
  landed maximum strictness after the JSDoc translation.
- When Storybook owner tuples change (new `storybook-controller`, stories that are their evidence,
  or a coverage-provider / Vite / Storybook / Chromium pin), run
  `npm run coverage:check-storybook-stability` at a clean revision. It reuses one Storybook process
  and requires identical coverage tuples. Map or hit-counter drift prints as a diagnostic.

### Instrumentation jitter

Istanbul coverage identity has three layers:

| Layer | What it is | Gate? |
| --- | --- | --- |
| Coverage tuple | Per-file statements, branches, functions, lines — covered over total | Yes. The lockfile, judged from one Storybook collection. |
| Hit counters | `s` / `f` / `b`, keyed by Istanbul’s internal IDs | No. Follows the location map. |
| Instrumentation locations | `statementMap` / `fnMap` / `branchMap` after Vite emits the module | No. |

Each `storybook dev` boot is a fresh Vite emit. Ten boots on GitHub Actions produced identical
tuples with drifting maps and ID-keyed hits, often all three controllers together, often 1 of 10
collections. That is compile-time geometry, not a hook bug. Stability collections therefore share
one Storybook process. Digest mismatches after that are execution, not emit jitter.

Do not collapse Node Vitest and Storybook Chromium into one coverage path. That pair is producer
identity ([ADR 010](./adr/010-producer-owned-coverage-evidence.md)), not this jitter.

## Policy pointers

- Coverage baseline is a **lockfile** (`coverage-baseline.json`); update only with
  `npm run coverage:update-baseline`.
- Node-owned runtime files gate only on fresh Node Vitest evidence. Storybook controllers gate
  only on fresh Storybook Chromium evidence. Non-owner execution cannot rescue either verdict.
- JSX / Storybook UI coverage is informational; missing ownership, discovery, or UI evidence still
  fails.
- Node **22** only (`.nvmrc` / `mise.toml` / `engines`); `verify` and `watch` refuse other majors.

## See also

- [ADR 006](./adr/006-test-execution-model.md) — two daily tiers; improve is not a third “done”
- [`docs/testing-and-validation.md`](./testing-and-validation.md) — protection model (why/when)
- [ADR 005](./adr/005-testing-and-storybook.md) — who tests what
- [ADR 010](./adr/010-producer-owned-coverage-evidence.md) - producer-owned exact coverage
