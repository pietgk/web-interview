# ADR 006: How tests are run

- Status: Accepted (superseded in part by [ADR 010](./010-producer-owned-coverage-evidence.md))
- Date: 2026-08-05
- Amended: 2026-08-14
- Scope: Command surface, execution stages, coverage gating, Node version
- Supersedes in part: [ADR 005](./005-testing-and-storybook.md) (coverage gate, a11y mode)
- Superseded in part by: [ADR 010](./010-producer-owned-coverage-evidence.md) (producer-owned exact coverage verdicts replace the merged exact baseline)

## Decision

Two daily tiers only — no middle “done”:

| Tier | Command | When |
| --- | --- | --- |
| Ambient | `npm run watch` | left open while working |
| The gate | `npm run verify` | before commit / “are we green?” |

Raising the contract is **improve**, not a third daily command: `coverage:update-baseline`,
stricter TypeScript or ESLint, and Storybook coverage admission when those owner tuples change.
Skipping improve is correct when the task is not to tighten. Agents must not treat it as done.

`verify` is four stages (`static` → `unit` → `browser` → `quality`): fail fast between stages,
collect every failure within a stage. Coverage is **collected** in unit/browser and **judged** in
quality. The coverage baseline is an exact attributable **lockfile**, not a
vanity target — update only via `npm run coverage:update-baseline`. Proof must not vanish quietly
(e.g. every UI component is storied or explicitly exempted). **Node 22** is asserted by
`verify`/`watch`, not merely pinned in config files.

Ten Storybook coverage collections are an improve-time measurement of the probe, not a verify
step. One Chromium Storybook run plus the lockfile is the controller contract. Collections share
one Storybook process so Vite emit jitter is not coverage identity. Vocabulary and when to run
admission: [`docs/verify.md`](../verify.md).

## See also

- [`docs/verify.md`](../verify.md) — watch / verify / improve, stages, jitter
- [`docs/testing-and-validation.md`](../testing-and-validation.md) — why/when protections exist
- [ADR 005](./005-testing-and-storybook.md) — layer ownership and Storybook rules
- [ADR 010](./010-producer-owned-coverage-evidence.md) - producer identity in exact coverage verdicts
- [`docs/adr/README.md`](./README.md)
- [`AGENTS.md`](../../AGENTS.md) — which command when
