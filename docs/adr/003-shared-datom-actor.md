# ADR 003: Shared datom actor and append-only persistence

## Status

Accepted

## Context

The previous frontend used one catalog state machine plus one independently persistent state
machine per todo list. The backend separately maintained a mutable object store. Although that
made each autosave lifecycle explicit, it duplicated ownership and made persistence behavior
specific to the browser.

We want one domain implementation that can run in the browser and in Node, provide a directly
subscribable read model, preserve an immutable transaction history, and support durable offline
work without putting transport concerns in React.

## Decision

Use one shared `TodoListActor` implementation from the shared package. A separate instance runs
in each browser application and one singleton instance runs in the Node process.

The actor accepts atomic transactions containing immutable datoms with the shape:

```text
[entity, attribute, value, transaction, added]
```

The shared package owns transaction validation, cardinality-one retractions, atomic application,
read-model projection, replay, as-of views, transaction builders, and selectors. It does not use
Datomic code or a Datomic dependency.

Storage is injected:

- Node uses `JsonlJournalStorage`. It serializes one checksummed JSONL record per transaction,
  waits for `datasync()` before acknowledgement, and rebuilds the read model by replay on startup.
- The browser uses `IndexedDbReplicaStorage`. It durably appends local transactions to an IndexedDB
  outbox, batches synchronization over HTTP, and rebases remaining local transactions over each
  authoritative server response.

React subscribes directly through `useSyncExternalStore`. Selection and ghost-composer focus are
ephemeral UI state; todos and their attributes are persistent facts.

The server assigns a monotonic `serverSeq`. Transaction ids make retries idempotent. Writes to
different attributes merge; concurrent writes to the same cardinality-one attribute resolve by
last server transaction.

## Journal guarantees

- Exactly one Node actor writes a journal file.
- One JSON line contains one complete transaction.
- Writes are serialized and acknowledged only after `datasync()`.
- A non-newline-terminated or invalid final record is discarded during recovery.
- Corruption before the final record fails startup.
- Multiple Node processes sharing one journal file are unsupported.

## HTTP contract

- `GET /api/todo-lists/read-model` returns `{ basis, todoLists }`.
- `POST /api/todo-lists/sync` accepts a basis and up to 100 transactions, then returns the new
  authoritative read model, accepted transaction ids, and structured rejections.
- The original whole-list `PUT` remains only as a compatibility boundary and translates its body
  into one datom transaction.

## Consequences

Positive:

- Browser and server use the same actor, transactor, projector, and schemas.
- The mutable backend store and per-list actor hierarchy are removed.
- UI updates remain optimistic while local durability and remote acknowledgement are distinct.
- Offline edits survive reload and synchronize idempotently after reconnection.
- Full history, as-of reads, and future compensating undo transactions are supported by the log.

Trade-offs:

- The JSONL journal is intentionally single-process and is not a horizontally scalable database.
- Text edits currently produce detailed per-change history, although network calls are batched.
- The complete journal is replayed at startup. Checkpoints can be added without changing the
  transaction format if journal size later makes replay material.
