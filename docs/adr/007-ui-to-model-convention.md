# ADR 007: How the UI talks to the model

- Status: Accepted
- Date: 2026-08-05
- Scope: Frontend modules between a rendered control and `todoClient`
- Supplies: the successor convention [ADR 004](./004-single-datom-log.md) did not write when it
  retired the actor

## Decision

Three owners of state, and only three:

| Owner | Holds | Lives in | Survives reload |
| --- | --- | --- | --- |
| Domain facts | titles, texts, completion, due dates, existence | the datom log | yes |
| Screen state | waiting, active list, drafting, delete confirm | `todoListsUiState.js` | no |
| In-flight text | unsettled field characters | `useSettledText.js` | no |

Rendering owns nothing. **After an interaction, classify by what changed** — domain fact →
**command**; screen offering → **event**; nothing yet (unsettled text) → neither until settle.

**Naming follows CQRS-ES tense.** Commands are imperative: they say what should be done to
domain facts (`renameList`, `deleteTodo`). Events are past-tense: they say what happened to
screen state (`LIST_SELECTED`, `DRAFT_STARTED`). Do not name an event like an order, and do not
name a command like a fact that already occurred.

Only `todoListCommands.js` may know datoms exist (`assert` / `retract` / `ATTRIBUTE`). There is
exactly one settle-timer mechanism (`useSettledText`); a `setTimeout` elsewhere for text settling
is an architecture defect.

ESLint enforces the datom import / assert·retract restrictions so the convention cannot fail
quietly.

## See also

- [`docs/conventions/ui-to-model.md`](../conventions/ui-to-model.md) — interaction checklist and
  module map
- [`docs/architecture.md`](../architecture.md) — settle granularity, ghost composer, StatusBar
- [ADR 004](./004-single-datom-log.md) — single-datom model this convention serves
- [`docs/adr/README.md`](./README.md)
