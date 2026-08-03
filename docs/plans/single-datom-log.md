# Implementation plan: single-datom log

Status: Ready for implementation in a fresh session.

This is the implementation handoff for [ADR 004](../adr/004-single-datom-log.md). The ADR is the
source of truth for the model. This document covers only what to build, what to delete, in what
order, and what to verify.

Before editing, read:

- `CONTEXT.md`
- `docs/adr/004-single-datom-log.md`
- this plan

## Objective

Replace the multi-datom transaction protocol with a single-datom append-only log projected by
last-write-wins, delivered over Server-Sent Events downward and HTTP POST upward.

The user-visible read model does not change. `TodoLists` stays `Record<string, {id, title,
todos: {id, text, completed, dueDate}[]}>`, so the React components change only where they mint
changes or read status.

## New code

### `shared/src/ulid.js`

Monotonic ULID generator. 48-bit millisecond timestamp plus 80 random bits, Crockford base32, 26
characters. Same millisecond increments the random component rather than redrawing it, so
same-millisecond writes from one client keep their order.

Two entry points: `ulid(ms)` for entity ids, and a clock-bound minter for `tx` that takes its
time from the server-time source rather than `Date.now()`. Nothing in the client calls
`Date.now()`.

Also `ulidTime(id)` decoding the first 10 characters, and `listId()` / `todoId(listId)` helpers
producing `L{ULID}` and `L{listULID}/T{ULID}`.

### `shared/src/datom.js`

Zod schema for the 5-tuple, plus the attribute table. Validates entity id shape, attribute
membership, attribute-to-entity-type match, value type and range, `tx` as a ULID, and `op` as a
boolean. Rejects unknown attributes rather than ignoring them.

Value rules carry over unchanged from `todoDatabase.js:61-83`: title 1 to 100 characters after
trimming, text up to 1000, `completed` boolean, `dueDate` via `isRealCalendarDate`.

Future-dated `tx` rejection is a server concern and takes the server clock as an argument, so it
does not live in the schema.

### `shared/src/datomStore.js`

```text
DatomStore
  #facts: Map<entity, Map<attribute, {v, tx, op}>>
  apply(datom): boolean          // true when it won on tx
  datomsSince(tx): Datom[]       // currently winning datoms with a higher tx
  readModel(): TodoLists         // memoized, invalidated on any winning apply
  subscribe(listener): {unsubscribe}
```

No `basis`, no transaction id set, no referential validation, no retraction synthesis. `apply`
is a comparison and an assignment.

`readModel()` must be memoized because `useSyncExternalStore` requires a referentially stable
snapshot. Projection rules are in ADR 004; the navigation bucketing in `selectors.js:42-59`
is unchanged and keeps consuming the projection order.

### `frontend/src/todos/todoClient.js`

Outbox array, `EventSource`, POST drainer, and the server-time source.

- Connect to `/api/datoms/stream?since={cursor}`, or without `since` on first connect.
- On each event: `store.apply(datom)`, advance the cursor to the event id.
- On heartbeat: update server time, with half-round-trip compensation taken from POST
  acknowledgements.
- Editing stays disabled until the first server time arrives, then stays enabled for the session.
- `onopen` / `onerror` drive `connection`.

### `backend/src/todos/datomJournal.js`

Append-only JSONL, one bare datom array per line. `datasync()` before resolving. Replay on
startup, discarding an unterminated or unparseable final line and failing on any earlier bad line.

Use a new default filename so a stale ADR 003 journal is never half-parsed, and delete the old
file as part of the change.

### `backend/src/routes/datoms.js`

- `GET /api/datoms/stream` - SSE. Honour `Last-Event-ID` in preference to `?since=`. Emit
  `id: {tx}` per event. Heartbeat carrying server time. Register and deregister the subscriber.
- `POST /api/datoms` - validate, reject `tx` more than five seconds ahead of server time, append
  and fsync, `apply`, broadcast winners to all subscribers, acknowledge.

Journal every valid datom including losers. Broadcast only winners.

## Deletions

| path | lines | reason |
|---|---|---|
| `shared/src/todoListActor.js` | 463 | replaced by DatomStore plus two thin runtimes |
| `shared/src/todoListActor.test.js` | 219 | follows the actor |
| `shared/src/transactions.js` | 305 | builders become one-line datom mints |
| `shared/src/todoDatabase.js` | 441 | replaced by `datom.js` and `datomStore.js` |
| `shared/src/todoDatabase.test.js` | 188 | follows |
| `shared/src/todoContract.js` | 160 | read-model and sync response schemas no longer exist |
| `shared/src/todoContract.test.js` | 84 | follows |
| `frontend/src/todos/indexedDbReplicaStorage.js` | 277 | client persists nothing |
| `frontend/src/todos/indexedDbReplicaStorage.test.js` | 169 | follows |
| `frontend/src/todos/persistenceConfig.js` | 8 | no replica, and no `clientId` since datoms carry no origin |
| `backend/src/todos/jsonlJournalStorage.js` + test | - | replaced by `datomJournal.js` |
| `backend/src/todos/createServerTodoActor.js` | - | replaced by the store plus routes |
| `backend/src/routes/todoLists.js` | - | replaced by `routes/datoms.js` |

From `shared/src/types.js`: `Transaction`, `TransactionOrigin`, `TodoDatabase`, `Facts`,
`RejectedTransaction`, `TransactionResult`, all four `TodoStorage*` types, `ActorStatus`,
`PersistenceStatus`, `SyncStatus`.

From `shared/src/todoProtocol.js`: `SYNC_TRANSACTION_LIMIT`, `TRANSACTION_VERSION`,
`TRANSACTION_CAUSE`, `GENESIS_TRANSACTION_ID`, `SEED_CLIENT_ID`, `ACTOR_EVENT`, `ACTOR_STATUS`,
`PERSISTENCE_STATUS`, `SYNC_STATUS`, and the `TRANSACTION_REJECTED` error code.

Add a one-time `indexedDB.deleteDatabase` for `REPLICA_DATABASE_NAME` and
`LEGACY_REPLICA_DATABASE_NAMES` on boot, so existing users do not carry orphaned storage.

## Changed code

`shared/package.json` exports map: drop `./actor`, `./contract`, `./database`, `./transactions`;
add `./datom`, `./datom-store`, `./ulid`. Keep `./selectors`, `./protocol`, `./types`. Update the
`files` array to match.

`shared/src/selectors.js`: `selectTodoListSummaries` is unchanged. `selectStatusBar` is rewritten
against `{connection, pendingCount, error}` per ADR 004, including the 300ms delay before
"Saving...". `hasLocallyUndurableChanges` is deleted.

`frontend/src/todos/components/TodoLists.jsx`: mint on settle. In-flight text stays in the
existing `composers` state, and the ghost composer materializes its Todo on first settle rather
than on the first character, so `isDematerializableTodo` in `todoModel.js:46-47` collapses to
`!text.trim()`. Every `transact(...)` call becomes a single datom mint.

`backend/src/seed.js`: emit datoms.

`backend/src/config.js`: new journal filename.

## Sequence

1. `ulid.js` with tests, including monotonicity within a millisecond and lexicographic time order.
2. `datom.js` schema with tests, including rejection of unknown attributes and entity-type
   mismatches.
3. `datomStore.js` with tests: last-write-wins on `tx`, out-of-order arrival, idempotent
   re-delivery, defining-attribute existence and undelete, todos hidden when their list is gone,
   and both sort directions.
4. Backend journal and routes, with the API and restart-durability tests rewritten.
5. Frontend client, then `TodoLists.jsx` and the StatusBar selector.
6. E2E.

Steps 1 through 3 are the whole model and are pure. Get them green before touching transport.

## Tests that carry the design

Most of this model fails *silently* when it is wrong: a datom that is not broadcast, a tombstone
that is not retained, a cursor that skips. Nothing throws, nothing looks broken, and one client
just quietly shows the wrong thing. So the tests are the executable statement of the rules, and
their names must state the rule rather than the mechanism. The list below is the specification.

### `ulid.js`

- two ids minted in the same millisecond sort in mint order
- lexicographic order equals time order across milliseconds
- `ulidTime` decodes the first 10 characters to the mint time

### `datom.js`

- rejects an unknown attribute rather than ignoring it
- rejects `title` on a Todo id and `text` on a Todo List id
- rejects a retraction that carries no value
- rejects a title that is empty after trimming, and one over 100 characters
- rejects a `dueDate` that is not a real calendar date

### `datomStore.js`

- a higher `tx` overwrites a lower one for the same entity and attribute
- a lower `tx` arriving later does not overwrite the winner
- re-applying an identical datom changes nothing and reports that it did not win
- an entity exists only while its defining attribute is asserted
- retracting a defining attribute hides the entity and its other attributes
- re-asserting a defining attribute restores `completed` and `dueDate`
- a Todo does not project when its Todo List does not exist
- Todos sort by id descending, Todo Lists sort by id ascending
- **renaming a Todo does not change its position** (regression: `min(tx)` over a compacted store
  would move it to the top, which is why the id carries a ULID)
- `readModel()` returns the same reference until a datom wins

### Stream endpoint

- a fresh connect returns the compacted current set, not the journal
- a superseded datom is never streamed
- a fresh connect emits datoms in ascending `tx` order
- **a client that was away receives the retraction for a Todo deleted while it was gone**
- **the heartbeat carries server time and carries no `id` field**
- `Last-Event-ID` is preferred over a stale `since` parameter
- a stale `since` parameter still converges, re-sending datoms harmlessly

The last one is worth writing even though it asserts a non-failure: it is the executable proof
that the preference rule above it is an efficiency choice and not a correctness dependency.

### POST endpoint

- a stale datom is journaled but not broadcast
- a client's own datom echoed back to it is a no-op
- a `tx` more than five seconds in the future is rejected
- a `tx` in the past is accepted and loses
- the response is not sent until `datasync()` has completed

### Journal

- an unterminated final line is discarded on recovery
- an unparseable earlier line fails startup
- replaying the journal reproduces the read model exactly

### Client

- editing is disabled until the first server time arrives
- editing stays enabled after the stream drops
- a text edit mints one datom on settle, not one per keystroke
- "Saving..." does not appear before `pendingCount` has been non-zero for 300ms

## Tests to change

The two offline journeys at `e2e/todos.spec.js:332` and `:395` assert IndexedDB restoration
across a reload. That capability is being removed, so they are replaced by:

- offline within a session: block the API, edit, unblock, assert the edit reaches the server
- reload while offline: assert the app reports a lost connection and disables editing rather than
  showing stale data
- **two tabs converge**: edit in one tab, assert the other updates without interaction. This is
  new capability and the demonstration that the model works.

`backend/src/app.test.js` and the journal tests move to the datom endpoints. `todoProtocol.test.js`
and `selectors.test.js` follow their modules.

## Docs to update when the code lands

These describe the shipped system and would be false if changed before implementation:

- `DECISIONS.md`: rewrite "Persistence", "API", "Shared runtime contract", "One shared actor",
  "Browser read model and offline behavior", "Todo List lifecycle", "Todos use stable entity ids",
  "Ghost composer", and "StatusBar". Move offline-across-reload from "Scope completed" to a stated
  non-goal. Add real-time multi-client convergence, and remove it from "Knowingly deferred".
- `README.md:24-31`: the submission bullets claim a durable IndexedDB outbox for offline edits and
  immutable datom transactions. Both need correcting.

## Verification

```bash
npm test
npm run test:e2e
npm run lint
npm run typecheck
npm run build --prefix frontend
npm run quality:lighthouse
```

Lighthouse must stay at 100 across all four categories. Watch the main-thread budget: an open
`EventSource` per tab is new, and `backend/src/app.js` has no `compression` middleware, so SSE
will not be buffered.
