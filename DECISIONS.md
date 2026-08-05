# Design decisions

This document captures why the implementation makes its key choices. Tests encode the expected
behavior; this file explains the trade-offs.

## How to verify

Use **Node 22** in this repo (`mise.toml` / `.nvmrc`); `verify` and `watch` refuse to run on
anything else.

```bash
npm run watch     # leave open while working
npm run verify    # everything CI runs, in the order CI runs it
```

`verify` runs four stages - `static`, `unit`, `browser`, `quality` - and stops at the first that
fails. Run one by name (`npm run verify browser`), or ask what each covers with
`npm run verify help`. Storybook for component work: `npm run storybook`.

Playwright browsers on a clean checkout: `npx playwright install chromium`.

The reasoning behind the stages, the coverage gate and the Node pin is in
[`docs/adr/006-test-execution-model.md`](./docs/adr/006-test-execution-model.md).

## Scope completed

- **Main:** Persist todo lists across server restarts in an append-only JSONL journal
- **Autosave:** No Save button; edits mint one datom when a field settles
- **Real time:** Multiple clients and browser tabs converge without interaction
- **Completed items:** Toggle per todo
- **Completed lists:** Derived indicator when every item is completed
- **Todo List lifecycle:** Create, rename, and delete whole Todo Lists in one datom each
- **Due dates:** Remaining and overdue labels, with completed items shown as `Completed`
- **StatusBar:** One global connection, delivery, and recovery surface
- **Tests:** Seam-based coverage, Storybook play for components, shared/backend unit gates, thin Playwright — [`docs/adr/005-testing-and-storybook.md`](./docs/adr/005-testing-and-storybook.md)

## Persistence: one datom per line in a JSONL journal

A datom is `[entity, attribute, value, tx, op]`, and every transaction contains exactly one of
them, so `tx` is the transaction id and the datom's identity at the same time. The server appends
one bare JSON array per line, calls `datasync()`, and only then acknowledges the write. Startup
replays the journal deterministically without requiring an external database.

There is no checksum: a torn write always loses the closing bracket and therefore always fails
`JSON.parse`, so a checksum would add roughly 70% to each line to detect only bit rot. Recovery
discards a final line that is unterminated or unparseable, and fails startup on any earlier bad
line.

The journal is intentionally single-process and replay cost grows with history.

## API: a Server-Sent Events stream down, HTTP POST up

`GET /api/datoms/stream` emits one datom per event with `id: {tx}` for the browser's cursor.
Omitting `since` returns the compacted current set: the highest-`tx` datom for each
`(entity, attribute)` pair, in ascending `tx` order, so superseded datoms are never sent and the
stream differs from the journal. A periodic `clock` event carries server time and deliberately
carries no `id`, because a clock tick is not a position in the datom log and giving it one would
make the client skip datoms on the next reconnect.

Retraction tombstones stay in the compacted set. A client that was disconnected when a Todo was
deleted learns of the deletion only from that retraction; without it the Todo would be immortal on
every client that missed it.

Each connection opens by naming the log it serves. The epoch is the `tx` of the journal's first
datom, so it needs no separate storage and survives restarts for free. A cursor names a position
in a log but never which log, so a client whose server was reset would otherwise fold a freshly
seeded log on top of the one it already held and show both sets of entities forever. On seeing a
different epoch, a client drops its store and its cursor and resyncs from empty.

`POST /api/datoms` sends the outbox and returns server time. The server journals every valid
datom, including the ones that lost, because the journal is the history. It broadcasts only
winners, because no client needs a datom that lost: a client whose write lost still converges,
since its cursor is behind and the stream hands it the winner.

Details: [`docs/adr/004-single-datom-log.md`](./docs/adr/004-single-datom-log.md).

## Last-write-wins removes the conflict path entirely

The current value of `(entity, attribute)` is the datom with the highest `tx`. All attributes are
cardinality-one, so a conflict can only be resolved by picking a winner, and the machinery for
reporting the loser to a user has no useful outcome. There are no rejections, no rollback, no
rebase, no `basis`, and no server sequence.

Nothing is synthesized at apply time. A rename writes one assertion, not a retraction plus an
assertion, so a datom is byte-identical in the browser, on the wire, and in the journal. Both
sides converge by construction, and the server's echo of a client's own datom is an exact no-op.

Re-delivering a datom produces an identical projection, so there is no idempotency bookkeeping at
all: no transaction id set, no accepted-id list, no duplicate detection.

## Shared runtime contract

The shared package owns one class and one schema. `DatomStore` folds datoms and projects the read
model; `datomSchema` validates entity id shape, attribute membership, attribute-to-entity-type
match, and value type and range. Both sides use them verbatim, so the fold and the projection
cannot diverge.

This implementation borrows the immutable-fact model. It does not contain Datomic code or depend
on Datomic.

## Browser read model and offline behavior

The browser adds an outbox array, an `EventSource` client, and a POST drainer. It persists
nothing. `EventSource`'s built-in reconnect and `Last-Event-ID` replace the sync cursor, the
debounce timer, the exponential backoff with jitter, and `navigator.onLine`.

The server prefers `Last-Event-ID` over `?since=` when both are present, because an auto-reconnect
re-requests the original URL carrying its now-stale `?since=` alongside a fresh header. That
preference is an efficiency rule, not a correctness rule, and a test asserts that a stale cursor
still converges.

A client mints `tx` from the last known server time plus elapsed monotonic time, and never reads
the local wall clock. Editing is disabled until the first server time arrives, then stays enabled
for the session. The stream sends the compacted set before it sends server time, so having a clock
also means having the state that came with it.

**Offline edits do not survive a reload.** The outbox is in memory. Offline work within a session
drains on reconnect, but refreshing the page discards it. This is a stated non-goal.

## Entity ids carry identity, `tx` carries order

| entity | id |
|---|---|
| Todo List | `L{ULID}` |
| Todo | `L{listULID}/T{ULID}` |

A ULID is a 48-bit millisecond timestamp plus 80 random bits in Crockford base32, so lexicographic
order is time order. Embedding the Todo List id in the Todo id removes a `todo/list` attribute and
makes a Todo that belongs to no Todo List unrepresentable rather than merely unlikely.

Carrying the timestamp in the id means creation time survives compaction, which `min(tx)` over
stored datoms does not: a compacted store holds only current winners, so a renamed Todo would
otherwise appear to have been created at the time of its rename. A test pins this.

Todos sort by id descending (newest first), Todo Lists by id ascending (oldest first). Both are
plain string comparisons needing no tie-break, because ULIDs are unique. The generator is
monotonic within a millisecond, so two ids minted in the same millisecond keep their mint order.

## Todo List lifecycle uses defining attributes, not tombstones

| attribute | entity | defining | value |
|---|---|---|---|
| `title` | Todo List | yes | string, 1 to 100 characters after trimming |
| `text` | Todo | yes | string, up to 1000 characters |
| `completed` | Todo | no | boolean |
| `dueDate` | Todo | no | calendar date |

An entity exists exactly while its defining attribute is currently asserted. Deleting a Todo List
retracts its `title`, which is one datom no matter how many Todos it holds: those Todos stop
projecting because the Todo List named by their ids no longer exists. Undelete is re-assertion,
and it restores the entity's other attributes with it.

Duplicate titles remain valid, because a Todo List is identified by itself, not by what it is
called.

The navigation order is a pure projection of the read model. Incomplete Todo Lists with a Next Due
Date come first by date, undated and empty Todo Lists retain creation order, and completed Todo
Lists retain creation order at the end.

## List completion is derived

List completion is never stored. A non-empty list is completed when every visible todo is
completed. Both the navigation summary and the active editor read the local projection, so they
update before the server has acknowledged anything.

## Edit granularity: mint on settle

In-flight text stays in React state. A datom is minted when a field settles: 500ms idle, blur, or
Enter, whichever comes first. Discrete actions (completed, due date, delete) mint immediately.

Without this, typing a twenty-character Todo would mint twenty datoms on `text`, nineteen of them
superseded within a second, and there is no transaction envelope left to group them. Leaving a
field by switching Todo Lists settles rather than discards, so the edit survives.

## Ghost composer

The composer's text and its link to a materialized Todo are ephemeral React state. The Todo
materializes on the first settle rather than on the first character, and a settled blank composer
retracts it again. Enter or the trailing Add button commits the row into the list.

## StatusBar is a pure projection of client status

The application creates one client and passes the same runtime to StatusBar and Todo Lists. A pure
selector maps `{connection, pendingCount, saving, canEdit, error}` to one ordered status line.

"Saving…" appears only after the outbox has been non-empty for 300ms, because settle-grained
minting followed by an immediate POST empties the outbox in roughly 50ms and an undelayed
indicator would flicker on every edit. The 300ms is a timer in the client, not in the selector, so
the selector stays pure and the delay stays testable on its own.

An outbox that cannot drain reports "Waiting for connection" even while the stream is nominally
open, because delivery is what the user cares about and saying "Saving…" forever would be a lie.

## Due-date formatting

`getDueStatus` returns structured `{ kind, label, days }` data and accepts an injectable current
date. Tests remain deterministic, colors depend on `kind` rather than string matching, and
completed todos are never described as overdue.

## Test pyramid

| Layer | Role |
|---|---|
| Shared core | ULID monotonicity, datom schema, last-write-wins fold, projection, selectors |
| Unit and component | Settle granularity, ghost composer, accessibility |
| Node integration | Journal recovery, restart durability, stream and POST semantics, durability ordering |
| Playwright | Online, offline, reload, and two-tab journeys in a real browser |

This model fails silently when it is wrong: a datom that is not broadcast, a tombstone that is not
retained, a cursor that skips. Nothing throws and one client just quietly shows the wrong thing,
so the test names state the rule rather than the mechanism.

## Knowingly deferred

- Authentication and authorization; a losing write cannot be distinguished from a hostile one
- Horizontal multi-process writers for one JSONL journal
- A tombstone horizon; retractions currently accumulate without bound in the compacted set
- Offline edits surviving a reload
- Selected-list persistence across refresh
- Journal checkpoints and compaction
- Manual Todo reordering, which would need an `order` attribute again
- Undo and redo UI, though undo is expressible as re-assertion of a defining attribute
