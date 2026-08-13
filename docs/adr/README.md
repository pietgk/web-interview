# Architecture decision records

ADRs record **what we chose and why** (trade-off + forbidden alternatives). They are short
decision cards, not essays.

| Kind | Home |
| --- | --- |
| Decision | this folder (`004`–`011` accepted) |
| How the system works | [`docs/architecture.md`](../architecture.md) |
| Protection model | [`docs/testing-and-validation.md`](../testing-and-validation.md) |
| Verify commands / stages | [`docs/verify.md`](../verify.md) |
| UI ↔ model checklist | [`docs/conventions/ui-to-model.md`](../conventions/ui-to-model.md) |
| Entry map | [`DECISIONS.md`](../../DECISIONS.md) |

Format and when to write an ADR: see `.agents/skills/domain-modeling/ADR-FORMAT.md` (this repo’s
**This repository** add-on requires Status, Date, Scope, Supersedes when applicable, and **See
also**).

Do **not** add a new ADR that duplicates [`docs/architecture.md`](../architecture.md).

## Accepted

| ADR | Decision |
| --- | --- |
| [004](./004-single-datom-log.md) | Single-datom log with last-write-wins; no conflict/rebase/rejection path |
| [005](./005-testing-and-storybook.md) | Seam-based coverage; Storybook owns component states/play/a11y |
| [006](./006-test-execution-model.md) | Two tiers only (`watch` / `verify`); coverage collected then judged; Node 22 |
| [007](./007-ui-to-model-convention.md) | Three state owners; only commands mint datoms; one settle mechanism |
| [008](./008-structured-datom-delivery-failures.md) | Structured delivery failures for the event-driven datom client |
| [009](./009-material-ui-9-platform.md) | Material UI 9.3 (Emotion, React 18); prefs platform before OS a11y prefs |
| [010](./010-producer-owned-coverage-evidence.md) | Exact coverage preserves the required Node or Storybook producer |
| [011](./011-typescript-source-language.md) | TypeScript source, maximum strictness, native Node type stripping |

## Superseded

Full text lives under [`archive/`](./archive/). Short tombstones remain at the original paths.

| ADR | Superseded by | Tombstone | Archive |
| --- | --- | --- | --- |
| 001 | [008](./008-structured-datom-delivery-failures.md) | [001](./001-error-handling.md) | [archive](./archive/001-error-handling.md) |
| 002 | [003](./003-shared-datom-actor.md) → [004](./004-single-datom-log.md) | [002](./002-xstate-actors.md) | [archive](./archive/002-xstate-actors.md) |
| 003 | [004](./004-single-datom-log.md) | [003](./003-shared-datom-actor.md) | [archive](./archive/003-shared-datom-actor.md) |
