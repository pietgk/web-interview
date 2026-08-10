# Verify reference

Command and stage reference for this repo. The non-drifting list of what each stage runs is:

```bash
npm run verify help
```

It is generated from the same table `scripts/verify.mjs` executes.

## Two tiers

| Tier | Command | When | Cost |
| --- | --- | --- | --- |
| Ambient | `npm run watch` | left open while working | ~2s per change |
| The gate | `npm run verify` | before commit / CI | ~70s |

There is no middle tier. Agents must not start `watch` (it never exits). Docs-only changes may use
`npm run verify static`; anything under `shared/`, `backend/`, `frontend/`, `scripts/`, or `e2e/`
needs a full green `verify` before claiming done. See [`AGENTS.md`](../AGENTS.md).

## Stages (summary)

| Stage | Needs | Roughly |
| --- | --- | --- |
| `static` | nothing executes | typecheck, lint (autofix then judge), diagrams, audit |
| `unit` | Node | shared, backend, frontend logic, scripts |
| `browser` | real Chromium | Storybook play/a11y, Playwright e2e |
| `quality` | production bundle | build, Lighthouse, merged coverage vs baseline |

Fail fast between stages; collect every failure within a stage. Selective runs:
`npm run verify browser`, `npm run verify lint e2e`, etc.

## Policy pointers

- Coverage baseline is a **lockfile** (`coverage-baseline.json`); update only with
  `npm run coverage:update-baseline`.
- JSX / Storybook UI coverage is informational; missing ownership, discovery, or UI evidence still
  fails.
- Node **22** only (`.nvmrc` / `mise.toml` / `engines`); `verify` and `watch` refuse other majors.

## See also

- [ADR 006](./adr/006-test-execution-model.md) — why two tiers and this gating shape
- [`docs/testing-and-validation.md`](./testing-and-validation.md) — protection model (why/when)
- [ADR 005](./adr/005-testing-and-storybook.md) — who tests what
