# ADR 003: Shared datom actor and append-only persistence

- Status: Superseded by [ADR 004](./004-single-datom-log.md)
- Scope: Shared TodoListActor, multi-datom transactions, journal, IndexedDB replica

Superseded. Full text: [`./archive/003-shared-datom-actor.md`](./archive/003-shared-datom-actor.md).

The immutable-fact model and the append-only journal survive. Multi-datom transactions, the
`basis` and `serverSeq` cursors, rebase-over-authoritative-response, per-transaction rejections,
and the IndexedDB replica do not. See [ADR 004](./004-single-datom-log.md) and
[`docs/architecture.md`](../architecture.md).
