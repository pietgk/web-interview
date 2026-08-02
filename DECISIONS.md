# Design decisions

This document captures why the implementation makes its key choices. Tests encode the expected
behavior; this file explains the trade-offs.

## How to verify

```bash
npm test
npm run test:e2e
npm run lint
npm run build --prefix frontend
```

Playwright browsers on a clean checkout: `npx playwright install chromium`.

## Scope completed

- **Main:** Persist todo lists across server restarts in an append-only JSONL journal
- **Autosave:** No Save button; optimistic local transactions with debounced network sync
- **Offline:** Durable IndexedDB outbox, reload recovery, and automatic reconnection
- **Completed items:** Toggle per todo
- **Completed lists:** Derived indicator when every item is completed
- **Due dates:** Remaining and overdue labels, with completed items shown as `Completed`
- **Tests:** Shared core, API and journal integration, React components, and Playwright journeys

## Persistence: immutable transactions in a JSONL journal

One transaction record contains all datoms that become true or false together. The server
serializes writes through one actor, appends one checksummed line, calls `datasync()`, and only
then acknowledges the transaction. Startup replay deterministically rebuilds the read model
without requiring an external database.

The journal is intentionally single-process and replay cost grows with history. Checkpoints or an
external transaction store can be added later without changing the domain transaction format.

## API: read-model and transaction synchronization

`GET /api/todo-lists/read-model` supplies the authoritative database value. `POST
/api/todo-lists/sync` accepts idempotent transaction batches and returns the new basis, accepted
ids, structured rejections, and authoritative read model. The client rebases any remaining local
transactions over that response.

The original whole-list `PUT` remains as a compatibility endpoint. It diffs the submitted list
against the actor read model and creates one datom transaction.

## Shared runtime contract

The shared package contains strict Zod schemas for todos, datoms, transactions, read models, and
sync responses. It also contains the atomic transactor, deterministic projector, replay and as-of
helpers, transaction builders, selectors, and the shared actor implementation.

This implementation borrows the immutable-fact model. It does not contain Datomic code or depend
on Datomic.

## One shared actor in the browser and server

Transaction validation, application, replay, and projection are domain behavior rather than
browser behavior. One `TodoListActor` implementation prevents the browser and Node from
developing different persistence semantics.

- One singleton actor runs in Node with `JsonlJournalStorage`
- One actor runs in each browser app with `IndexedDbReplicaStorage`
- React subscribes directly with `useSyncExternalStore`
- Local persistence is serialized; remote synchronization is debounced and retryable
- Transaction ids make uncertain HTTP retries idempotent
- Server sequence is the authoritative order for concurrent cardinality-one writes

Details: [`docs/adr/003-shared-datom-actor.md`](./docs/adr/003-shared-datom-actor.md).

## Browser read model and offline behavior

The visible model is the latest authoritative server model plus locally pending transactions.
Each local transaction is written to IndexedDB before it depends on network delivery. On sync,
the browser removes accepted transactions and replays any remaining transactions over the server
response. This makes page-exit network requests an optimization rather than a correctness
requirement.

The actor exposes local persistence, remote synchronization, pending work, and errors separately,
so the UI can say `Saving`, `Saved offline`, or `All changes saved` accurately.

## List completion is derived

List completion is never stored. A non-empty list is completed when every visible todo is
completed. Both the navigation summary and active editor use the optimistic actor read model, so
they update before server acknowledgement.

## Todos use stable entity ids

The UI read model remains:

```js
{ id, text, completed, dueDate }
```

Persistent attributes are stored as cardinality-one facts. Todo deletion is a `todo/deleted =
true` assertion, which preserves history and permits a future compensating undo transaction.

## Ghost composer

The focus and linked-id state are ephemeral React state. The first non-whitespace character
creates a persistent todo transaction. Enter or the trailing Add button commits the row visually.
Clearing a linked todo creates a deletion transaction unless another persistent attribute keeps
it materialized.

## Due-date formatting

`getDueStatus` returns structured `{ kind, label, days }` data and accepts an injectable current
date. Tests remain deterministic, colors depend on `kind` rather than string matching, and
completed todos are never described as overdue.

## Test pyramid

| Layer | Role |
|---|---|
| Shared core | Schemas, atomic transactor, replay, actor, and selectors |
| Unit and component | Domain rules, optimistic rendering, batching, retry, and accessibility |
| Node integration | Journal recovery, restart durability, API contract, and idempotency |
| Playwright | Online and offline journeys across real browser reloads |

Failure paths such as torn writes, duplicate delivery, offline reload, invalid transactions, and
completed due dates are first-class tests.

## Knowingly deferred

- Authentication and authorization
- Creating or deleting whole lists
- Horizontal multi-process writers for one JSONL journal
- Multi-tab coordination beyond server-sequence convergence
- Selected-list persistence across refresh
- Journal checkpoints and compaction
- Undo and redo UI; transaction history and as-of replay primitives already exist
