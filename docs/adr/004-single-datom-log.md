# ADR 004: Single-datom log with last-write-wins projection

- Status: Accepted
- Date: 2026-08-03
- Scope: Datom shape, persistence, wire protocol, projection, ids, defining attributes
- Supersedes: [ADR 003](./003-shared-datom-actor.md)

## Decision

Every transaction is exactly one datom `[entity, attribute, value, tx, op]`. The current value of
`(entity, attribute)` is the highest-`tx` datom (last-write-wins). There is no conflict path: no
rejections, rollback, rebase, `basis`, or server sequence. Datoms are byte-identical in the
browser, on the wire, and in the journal — nothing is synthesized at apply time.

An entity exists while its defining attribute is asserted; deletes are one datom (retract the
defining attribute), regardless of how many child Todos a Todo List holds.

Autosave changes one attribute of one entity per action, so multi-datom atomicity was ceremony.
Cardinality-one attributes make “report the loser” useless. The distributed transaction protocol
from ADR 003 (multi-datom tx, `serverSeq`, rebase, IndexedDB replica) was therefore removed.

## See also

- [`docs/architecture.md`](../architecture.md) — journal, SSE/POST, ids, lifecycle, client,
  deferred non-goals
- [`docs/adr/README.md`](./README.md) — accepted / superseded index
- [`DECISIONS.md`](../../DECISIONS.md) — entry map
- [ADR 008](./008-structured-datom-delivery-failures.md) — delivery failures
- [ADR 007](./007-ui-to-model-convention.md) — how the UI reaches this model
