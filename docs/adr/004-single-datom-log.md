# ADR 004: Single-datom log with last-write-wins projection

## Status

Accepted. Supersedes [ADR 003](./003-shared-datom-actor.md).

## Context

ADR 003 introduced atomic multi-datom transactions, a server-assigned `serverSeq`, a client
`basis` cursor, rebase-over-authoritative-response, structured per-transaction rejections, and a
durable IndexedDB replica. Each piece was individually defensible, but together they made a todo
list application carry a distributed transaction protocol.

Three observations collapse most of it:

1. The application autosaves. Every user action changes exactly one attribute of exactly one
   entity, so no user action needs more than one datom to be atomic.
2. Todo Lists are identified by id, not by title, so duplicate titles are already legal and
   creation never conflicts.
3. All attributes are cardinality-one. A conflict on one can only be resolved by picking a
   winner, so the machinery for reporting the loser to a user has no useful outcome.

## Decision

### The datom

```text
[entity, attribute, value, tx, op]
```

Every transaction contains exactly one datom, so `tx` is the transaction id and the datom's
identity at the same time. `op` is `true` for an assertion and `false` for a retraction.

A retraction carries the value the client believed it was removing. That value is informational:
only `tx` decides which datom wins, so a retraction never needs a compare-and-swap against
current state.

Nothing is synthesized at apply time. A rename writes one assertion, not a retraction of the old
value plus an assertion of the new one. The consequence is that a datom is byte-identical in the
browser, on the wire, and in the server journal, so both sides converge by construction.

### Entity ids

| entity | id |
|---|---|
| Todo List | `L{ULID}` |
| Todo | `L{listULID}/T{ULID}` |

A ULID is a 48-bit millisecond timestamp plus 80 random bits in Crockford base32, so its
lexicographic order is its time order. One monotonic ULID generator produces both entity ids and
`tx` values.

Embedding the list id in the todo id removes the `todo/list` attribute and makes a todo that
belongs to no list unrepresentable rather than merely unlikely. Carrying the timestamp in the id
means creation time survives compaction, which `min(tx)` over stored datoms does not: a compacted
store holds only current winners, so a renamed todo would otherwise appear to have been created
at the time of its rename.

Ids and `tx` values are independent. Ids identify; `tx` orders.

### Attributes

| attribute | entity | defining | value |
|---|---|---|---|
| `title` | Todo List | yes | string, 1 to 100 characters after trimming |
| `text` | Todo | yes | string, up to 1000 characters |
| `completed` | Todo | no | boolean |
| `dueDate` | Todo | no | calendar date |

Each entity type declares one **defining attribute**. Asserting it creates the entity; retracting
it deletes the entity. This replaces the `list/deleted` and `todo/deleted` tombstones, replaces
`list/order` and `todo/order` with the id timestamp, and replaces `todo/list` with the id prefix.
Nine attributes become four.

### Rules

1. One datom per user action, without exception. Deleting a Todo List holding 500 Todos is one
   datom.
2. The current value of `(entity, attribute)` is the datom with the highest `tx`. Last write wins.
   There are no conflicts, no rejections, and no rebase.
3. An entity exists exactly while its defining attribute is currently asserted. Undelete is
   re-assertion, and it restores the entity's other attributes with it.
4. A Todo belongs to the Todo List named by its id prefix, and does not project when that Todo
   List does not exist. There is no referential validation.
5. Creation order is a pure function of the id. Todos sort by id descending (newest first), Todo
   Lists sort by id ascending (oldest first). Both are plain string comparisons needing no
   tie-break, because ULIDs are unique.
6. Re-delivering a datom produces an identical projection, so there is no idempotency
   bookkeeping: no transaction id set, no accepted-id list, no duplicate detection.
7. A client mints `tx` from the last known server time plus elapsed monotonic time. It never
   reads the local wall clock. With no server time it does not mint at all, and editing is
   disabled.
8. The server rejects only malformed datoms, unknown attributes, attribute and entity-type
   mismatches, invalid values, and a `tx` more than five seconds in the future.

Rule 8 is one-sided deliberately. A past-dated `tx` is harmless because it loses. A future-dated
`tx` is poison because it wins every conflict until wall time catches up, so a correctly clocked
client cannot overwrite it.

### Runtime

The shared package owns one class and one schema. Both sides use them verbatim, so the fold and
the projection cannot diverge.

```text
DatomStore
  Map<entity, Map<attribute, {v, tx, op}>>
  apply(datom) -> whether it won
  datomsSince(tx) -> currently winning datoms newer than tx
  readModel() -> memoized TodoLists
  subscribe(listener)
```

Transport and durability sit outside it.

- The browser adds an outbox array, an `EventSource` client, and a POST drainer. It persists
  nothing.
- The server adds a JSONL appender, a subscriber registry, and two routes. Startup replays the
  journal into the store.

`readModel()` is memoized because `useSyncExternalStore` requires a referentially stable snapshot.

### Protocol

- `GET /datoms/stream?since={tx}` is a Server-Sent Events stream. Each event carries `id: {tx}`
  and one datom as a bare five-element array, so `id` duplicates the datom's fourth element on
  purpose: `data` is the fact, `id` is the browser's cursor bookkeeping.
  - **Omitting `since`** returns the compacted current set: the highest-`tx` datom for each
    `(entity, attribute)` pair, emitted in ascending `tx` order so the cursor advances
    monotonically. Superseded datoms are never sent, so the stream and the journal differ.
  - **Supplying `since`** returns only datoms with a higher `tx`. Retraction tombstones must be
    retained in the compacted set for this case: a client that was disconnected when a Todo was
    deleted learns of the deletion only from that retraction, and without it the Todo is immortal
    on every client that missed it. A client with no `since` has an empty store and has nothing
    to unlearn, but including tombstones there too keeps its cursor at the true log position
    rather than at the newest non-tombstone.
- A periodic heartbeat carries server time and keeps the connection open through proxies. It is
  sent as `event: clock` and **must not carry an `id` field**. Any event with an `id` overwrites
  the browser's `Last-Event-ID`, and a clock tick is not a position in the datom log, so giving
  it one would make the client skip datoms on the next reconnect.
- Each connection opens with `event: epoch`, naming the log being served. It carries no `id`, for
  the same reason the clock does not. The epoch is the `tx` of the journal's first datom, so it
  needs no separate storage and survives restarts for free; recovery only ever truncates the last
  line, so the first one is stable.

  A cursor names a position in a log but never *which* log. Without an epoch, a client whose
  server was reset would reconnect, receive a freshly seeded log whose ULIDs were minted now and
  therefore sort above its cursor, and fold that log **on top of** the one it already held. Both
  sets of entities would then be visible forever, and nothing would ever reveal the mistake. On
  seeing an epoch different from the one its store was folded from, a client drops its store and
  its cursor and resyncs from empty. The epoch comes first in the connection so it can do that
  before folding anything from the new log.
- `POST /datoms` sends the outbox and returns a bare acknowledgement.

`EventSource` accepts no request headers, so the cursor travels two ways. The first connect of a
page load supplies neither, because the client persists nothing and wants the whole compacted
set. A browser auto-reconnect supplies `Last-Event-ID` on its own. A client that tears down and
rebuilds its `EventSource` has lost `Last-Event-ID`, so it puts its in-memory cursor in `?since=`.

The server prefers `Last-Event-ID` over `?since=` when both are present, because an auto-reconnect
re-requests the original URL carrying its now-stale `?since=` alongside a fresh header. That
preference is an efficiency rule, not a correctness rule: serving the stale cursor re-sends datoms
the client already holds, and re-applying a datom is an exact no-op.

The server journals every valid datom, including losers, because the journal is the history. It
broadcasts only winners, because no client needs a datom that lost. A client whose write lost
still converges: its cursor is behind, so the stream hands it the winner.

The server's echo of a client's own datom is an exact no-op on that client, because the datom is
byte-identical and the fold is idempotent.

### Journal

One line is one datom, serialized as a bare JSON array of five values. There is no checksum: a
torn write always loses the closing bracket and therefore always fails `JSON.parse`, so a
checksum would add roughly 70% to each line to detect only bit rot. `datasync()` completes before
the POST is answered, so the server is never less durable than a browser that has already
rendered the datom.

Recovery discards a final line that is unterminated or unparseable, and fails startup on any
earlier bad line.

### Edit granularity

In-flight text stays in React state. A datom is minted when a field settles: 500ms idle, blur, or
Enter, whichever comes first. Discrete actions (completed, due date, delete) mint immediately.

Without this, typing a twenty-character Todo would mint twenty datoms on `text`, nineteen of them
superseded within a second, and there is no transaction envelope left to group them.

### Status surface

The client exposes `{connection, pendingCount, error}` where connection is `connecting`, `live`,
`reconnecting`, or `failed`. The StatusBar shows "Saving..." only after `pendingCount` has been
non-zero for 300ms, because settle-grained minting followed by an immediate POST empties the
outbox in roughly 50ms and an undelayed indicator would flicker on every edit.

## Consequences

Positive:

- Nine attributes become four; the transaction envelope and its eight fields disappear.
- No conflict path exists, so rejections, rollback, rebase, `basis`, and `serverSeq` are gone
  along with the UI that reported them.
- No idempotency bookkeeping exists, because identical datoms are naturally idempotent.
- Multiple clients and multiple browser tabs converge in real time, which the previous design
  explicitly deferred.
- `Last-Event-ID` and `EventSource`'s built-in reconnect replace the sync cursor, the debounce
  timer, the exponential backoff with jitter, and `navigator.onLine`.
- Undo is expressible as re-assertion of a defining attribute, though no UI exposes it.
- Creation order is correct across clients and within a millisecond, which the previous
  `-Date.now()` ordering was not.

Trade-offs:

- **Offline edits no longer survive a reload.** The outbox is in memory. Offline work within a
  session still drains on reconnect, but refreshing the page discards it.
- A losing write is discarded silently. That is correct behavior for last-write-wins, but the
  system cannot distinguish a stale write from a hostile one, which is an authentication concern
  the project does not address.
- The client cannot be edited until the stream has opened once, because it has no trustworthy
  clock until then.
- Server-Sent Events are download-only, so client-to-server delivery is a separate POST channel
  with no ordering guarantee relative to the stream. Last-write-wins makes that harmless, but it
  is two channels rather than one.
- **Hydration re-projects once per streamed datom.** Server-Sent Events deliver one datom per
  message, each `apply` notifies, and each notification drives a render that reads `readModel()`,
  so a fresh client projects the whole store once per datom it receives. Separate messages are
  separate tasks, so React cannot batch them. Projection itself is linear and quick; the total is
  quadratic. Measured over a store of that size: 500 datoms 74ms, 1,000 290ms, 2,000 1.2s, 4,000
  4.6s, against roughly 2ms for one projection at 4,000. Invisible at the sizes this application
  has and squarely on the path of the tombstone problem below, since a tombstone is iterated by
  every projection and rendered by none. The remedies are a tombstone horizon, coalescing the
  initial burst into fewer messages, or projecting incrementally instead of wholesale; none is
  implemented.
- **Retraction tombstones accumulate without bound.** Every deleted entity leaves a retraction in
  the compacted set forever, so a fresh client downloads every deletion in the history: a Todo
  List with 50 live Todos and 5,000 deleted ones ships 5,000 datoms it will never render. The
  standard remedy is a tombstone horizon, evicting retractions older than a fixed age and
  requiring any client away longer than that to resync from empty. Not implemented, and it is the
  first thing to add if history volume becomes material.
- The journal is still single-process and still replayed in full at startup.
- Reordering Todos by hand would require reintroducing an `order` attribute, since order is
  currently a function of the id.
