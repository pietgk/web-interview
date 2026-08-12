# ADR 006: How tests are run

- Status: Accepted (superseded in part by [ADR 010](./010-producer-owned-coverage-evidence.md))
- Date: 2026-08-05
- Scope: Command surface, execution stages, coverage gating, Node version
- Supersedes in part: [ADR 005](./005-testing-and-storybook.md) (coverage gate, a11y mode)
- Superseded in part by: [ADR 010](./010-producer-owned-coverage-evidence.md) (producer-owned exact coverage verdicts replace the merged exact baseline)

## Decision

Two tiers only — no middle tier:

| Tier | Command | When |
| --- | --- | --- |
| Ambient | `npm run watch` | left open while working |
| The gate | `npm run verify` | before commit / “are we green?” |

`verify` is four stages (`static` → `unit` → `browser` → `quality`): fail fast between stages,
collect every failure within a stage. Coverage is **collected** in unit/browser and **judged** in
quality. The coverage baseline is an exact attributable **lockfile**, not a
vanity target — update only via `npm run coverage:update-baseline`. Proof must not vanish quietly
(e.g. every UI component is storied or explicitly exempted). **Node 22** is asserted by
`verify`/`watch`, not merely pinned in config files.

## See also

- [`docs/verify.md`](../verify.md) — stages, commands, contributor flow (points at
  `npm run verify help`)
- [`docs/testing-and-validation.md`](../testing-and-validation.md) — why/when protections exist
- [ADR 005](./005-testing-and-storybook.md) — layer ownership and Storybook rules
- [ADR 010](./010-producer-owned-coverage-evidence.md) - producer identity in exact coverage verdicts
- [`docs/adr/README.md`](./README.md)
- [`AGENTS.md`](../../AGENTS.md) — which command when
