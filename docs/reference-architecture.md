# Reference architecture

A specification for building an app that one Owner owns completely: its data, its functionality,
and its presentation. It is domain-agnostic. The todo application in this repository is its
reference implementation and its worked example, not its subject.

## Purpose and how to read this

The goal is a starting point that resists slop. An app built from this spec should reach useful
functionality with an architecture solid enough that neither a human nor a language model has to
invent the load-bearing parts, and structured enough that the architecture can be validated rather
than believed.

That only works if the spec is honest about what it has proven. Every section carries a status:

| Status | Meaning |
| --- | --- |
| **Proven** | The reference implementation does this, and a gate in its verification pipeline fails if it stops. |
| **Adopted** | Normative. We judge it sound and it follows from the Proven parts, but nothing here implements it yet. |
| **Hypothesis** | Not normative. An idea with a stated trigger for promotion. Appendix A only. |

Adopted is a real commitment, not a hedge: an implementation that contradicts an Adopted rule does
not conform. The label exists so a reader knows which claims are backed by running code and which
are backed by argument. The list of Adopted sections is also the backlog this repository would work
through to become a full instance of its own reference architecture.

Normative statements use **must** and **must not**. Everything else is explanation, and explanation
is not decoration here: a rule whose reason is missing gets broken by the first person who meets a
case it did not anticipate.

## Language

Terms defined here mean only what they say here. Where a word has a well-known meaning we are not
using, the definition says so.

**Owner**:
The party accountable for one App: a human, a language model, or a system. The Owner decides what
becomes fact. An Owner never appears in the mechanism, only in the invariants.
_Avoid_: user, principal, tenant

**App**:
One Log together with every Actor of it. The whole thing an Owner owns. One Owner, one App.
_Avoid_: instance, system, workspace

**Actor**:
A process that holds state and acts within one App: the Journal, a browser client, a phone client,
an agent. An Actor holds Facts, hosts Read Models, and runs Commands.
This is not the actor model. Mailboxes, addresses, and supervision trees are not implied.
_Avoid_: node, service, peer

**Journal**:
The Actor that holds the Log and is the only writer to it. Its Facts are the Log.
_Avoid_: server, backend

**Log**:
The append-only record of every Datom of one App, in transaction order, together with its Epoch.
The only source of truth. Everything else is derived from it.
_Avoid_: event store, database

**Epoch**:
The identity of a Log, distinguishing it from any other Log including an earlier one at the same
address. A cursor names a position in a Log but never which Log, so without an Epoch a reset is
indistinguishable from a rewind.

**Datom**:
One fact: `[entity, attribute, value, tx, op]`, where `op` is assertion or retraction. A Datom is
also the event, and the only event type an App has. There is no second vocabulary of domain events.
_Avoid_: event, record, row

**Transaction**:
The unit of write. A Transaction contains exactly one Datom, so `tx` is both the transaction
identifier and the Datom's identity, and it is the sole arbiter of order.

**Facts**:
An Actor's local copy of its App's current set, together with the cursor naming how far it has
read. Data, not a process. Its only mutation is applying a Datom.
_Avoid_: cache, replica, store

**Current set**:
For every `(entity, attribute)` pair in a Log, the Datom with the highest `tx`, retractions
included. What a Log means right now, as opposed to everything it remembers.
_Avoid_: snapshot, state

**Read Model**:
A typed view derived from Facts, defined by the questions it answers. Rebuildable from the Log,
never a source of facts. A Read Model whose output is prose is a Context Projection; a Read Model
that answers similarity or text queries is an Index.
_Avoid_: view, cache, projection table

**Read Model Engine**:
What hosts a Read Model and answers its questions: an in-memory fold, an embedded SQL database, a
full-text index, a vector index. Its native query surface is that Read Model's interface.

**Command**:
An expression of an Owner's intent, run by an Actor, and the only thing that mints a Datom.

**Message**:
The crossing between two Apps. Sent by an Actor of one App to an Actor of another, it is input,
never a write. Sync inside an App is not a Message.

**Lazy Value**:
Content too large to carry in a Datom, named in the Datom by a Content Address and fetched on
demand. A document body, an image, a transcript.

**Content Address**:
A name for immutable content derived from the content itself, so the name cannot go stale and two
Apps that hold the same bytes agree on the name without coordinating.

**Blob Store**:
Where Lazy Values live. Addressed by Content Address, append-only in effect because content and
name are bound.

**Index**:
A Read Model built for lookup rather than for reading: full-text, vector, or graph adjacency.
Derived, rebuildable, never synced, and never a Datom.

**Delegation**:
An Owner directing work that exceeds one Actor's budget to another Actor of the same App. An agent
building a vector Index the browser cannot hold is Delegation, not a second App.

---

# 1. The core model

## 1.1 A Datom is the fact and the event

**Status: Proven.**

The architecture is event-sourced, and the Datom is the event. An App must not define a second
event vocabulary layered over Datoms.

This is worth stating plainly because most CQRS-ES systems have two shapes: coarse domain events in
the log, and a projection that unpacks them. Here the log holds facts at attribute granularity, and
the projection assembles them. The consequences run through the whole spec: there is nothing to
version but attributes, nothing to interpret but assertion and retraction, and a Datom is
byte-identical in an Actor, on the wire, and in the Log.

A Datom is `[entity, attribute, value, tx, op]`. `op` true is an assertion, false a retraction. A
retraction carries the value the Actor believed it was removing; that value is informational, since
only `tx` decides which Datom wins.

## 1.2 One Datom per Transaction

**Status: Proven.**

A Transaction must contain exactly one Datom. There is no envelope, no batch, and no atomic
multi-attribute write.

Everything the architecture is cheap because of follows from this. `tx` is identity and order at
once, so there is no separate transaction id. A Datom needs no unwrapping, so the same bytes sit in
the Log, on the wire, and in Facts. Re-delivering a Datom produces an identical fold, so there is
no idempotency bookkeeping anywhere: no accepted-id set, no duplicate detection, no sequence
numbers.

Multi-Datom envelopes are a non-goal. Adding one would reintroduce partial application, ordering
within an envelope, and the question of what a cursor points at mid-envelope. Section 1.3 solves
the case envelopes are usually reached for.

## 1.3 Defining attributes

**Status: Proven.**

Every entity type must have exactly one **defining attribute**. An entity exists exactly while its
defining attribute is currently asserted. Deletion is retraction of the defining attribute, and
nothing else. An entity's other attributes must not be retracted to delete it.

**Creation order (Adopted).** When an entity is created with several attributes, a Command must
assert the non-defining attributes first and the defining attribute last. Until the defining
attribute lands the entity does not exist, so no Read Model can observe a half-built entity. This
is what replaces the atomic multi-attribute write that section 1.2 forbids.

Deletion is one Datom regardless of how much the entity contains, because everything that depends
on the entity stops projecting when the entity stops existing. In the reference implementation a
Todo List's defining attribute is its title and a Todo's is its text, so deleting a Todo List
holding fifty Todos writes exactly one retraction.

Re-asserting a defining attribute restores the entity along with every other attribute it still
has. At the storage layer that is a feature, and it is what makes undo expressible without an undo
log. At the Command layer it is a hazard, and section 4.3 constrains it.

## 1.4 Last write wins, and there is no conflict path

**Status: Proven.**

The current value of `(entity, attribute)` is the Datom with the highest `tx`. Every attribute is
cardinality-one and value-replacing. There must be no conflict detection, no rejection of a write
for conflicting, no rollback, no rebase, and no server-assigned sequence.

The server journals every valid Datom, including ones that lost, because the Log is the history. It
broadcasts only winners, because no Actor needs a Datom that lost: an Actor whose write lost is
behind, and the next thing it receives is the winner.

**Why this is defensible here.** One Owner owns the App. The same Owner may act from a desktop, a
phone, a browser tab, and an agent, but they are one party who knows what they did where. The last
write is therefore the Owner's own latest intent, and the machinery for telling someone they lost
has no useful recipient. Multiple Owners do not share a Log at all; they exchange Messages
(section 6), which is a different mechanism with different guarantees.

### Modelling what would otherwise need merging

**Status: Adopted.**

Anything whose correct concurrent behaviour is a merge must be modelled as entities, not as a
merged value.

A **set** is a set of entities, one per member, each with a defining attribute. Adding a tag
asserts a tag entity; removing it retracts that entity. Two Actors adding different tags
concurrently touch different entities and both survive. Modelling tags as one comma-joined string
would lose one of them.

A **counter** is a set of increment entities, summed by the Read Model. Two concurrent increments
are two entities and the sum is two. Modelling a counter as an integer attribute would lose one
increment, because last-write-wins on `5` and `5` is `5`.

The pattern generalises: state that needs merging is derived from facts rather than stored as a
merged value. This is the event-sourcing idiom, not a workaround, and it is why "code as query"
(section 5) has real work to do.

### The limits this accepts

These are consequences, not oversights. An Owner adopting this spec inherits all five.

1. **Single-value attributes only.** Anything that merges becomes entities plus a fold.
2. **The loser is never told.** A write that loses does so silently. Building "someone else changed
   this, review before saving" requires a basis on every write, which this spec does not have.
3. **Order trusts Actor clocks, disciplined by server time** (section 4.2), not arrival order. A
   broken or hostile Actor that mints a future `tx` wins every conflict until wall time catches up.
   Section 4.2's five-second guard bounds the damage; authorization, not sequencing, is where this
   is properly fixed, and authorization is a non-goal (section 10).
4. **No concurrent co-editing of one text value.** Two Actors typing into the same field lose one
   side's keystrokes at each settle. Collaborative text needs CRDTs or operational transformation,
   and both break the byte-identical-Datom property.
5. **A long offline session can lose to concurrent remote writes without warning**, because its
   Datoms carry old `tx` values and old `tx` loses.

Each limit is a door. Opening conflict detection or rebase requires a basis on every write; opening
server sequencing requires a server-assigned identifier alongside `tx`; opening CRDTs requires a
merge function per attribute type. Any of the three ends "a Datom is byte-identical everywhere" and
"there is no idempotency bookkeeping". That is the price, and it should be paid deliberately.

## 1.5 Identity

**Status: Proven** for ULIDs and composition, **Adopted** for reference attributes.

**Entity ids must be ULIDs**, or an equivalent lexicographically-sortable time-ordered identifier.
A ULID is a millisecond timestamp followed by random bits in an encoding whose lexicographic order
is time order. Three things come free: sorting by id is sorting by creation time with no tie-break
and no `createdAt` attribute; creation time survives compaction, which `min(tx)` over stored Datoms
does not, since a compacted set holds only winners and a renamed entity would appear to have been
created when it was renamed; and ids minted concurrently by different Actors do not collide.

**Composition.** When a child cannot exist without its parent and never moves between parents, the
child's id must embed the parent's id: `L{parent}/T{child}`. The relationship is then readable from
the id, needs no attribute and no index, cannot be missing or wrong, and disappears with the parent
because every id under that prefix stops projecting. It nests.

**Reference attributes.** Every other relationship is an ordinary attribute whose value is an
entity id, last-write-wins like any other attribute. Use this when the child can be re-parented, or
belongs to several parents, or outlives its parent. "Belongs to many" combines a reference attribute
with the entity-per-link rule from section 1.4: the link itself is an entity.

The test is one sentence: **embed when the child dies with the parent and never moves, otherwise
reference.**

---

# 2. The Log

**Status: Proven** for the properties, with one reference implementation.

## 2.1 Required properties

A Log must:

1. **Be append-only.** Records are never rewritten, reordered, or removed.
2. **Hold one Datom per record**, in `tx` order.
3. **Be durable before acknowledgement.** A write is acknowledged only after it will survive
   process death. An Actor's outbox depends on this: it discards a Datom on acknowledgement.
4. **Replay deterministically.** Folding the whole Log yields exactly the current set, every time,
   on any implementation. Every Read Model and every Index depends on this, because all of them are
   rebuilt by replay.
5. **Have an Epoch that changes when the Log is replaced**, and announce it before any Datom
   (section 3.1).
6. **Make a torn tail detectable and discardable.** Recovery discards an incomplete final record
   and fails loudly on a damaged earlier one. Silent truncation of history is the one unacceptable
   failure, because everything derived is rebuilt from the Log.

## 2.2 The reference implementation

A JSONL file: one bare JSON array per line, appended, flushed to disk, and only then acknowledged.
Startup replays it into memory.

There is no checksum. A torn write loses its closing bracket and therefore always fails to parse,
so the format detects the failure that actually happens, while a checksum would add roughly seventy
percent to every line to catch only bit rot.

The Epoch is the `tx` of the Log's first Datom. It needs no storage of its own, survives restarts
for free, and changes exactly when the Log is replaced.

Any store meeting section 2.1 conforms. An embedded SQL database or an object store with an
append-only convention are both reasonable; the file is the simplest thing that demonstrably works,
and it is the right first implementation precisely because it can be read with `cat`.

---

# 3. Sync

**Status: Proven** for the protocol properties and whole-set sync, **Adopted** for the Lazy Value
and Index rules.

## 3.1 Required properties

The Journal and an Actor's Facts converge under these rules, whatever the transport:

1. **Epoch first.** Every connection announces the Epoch before any Datom. An Actor that sees an
   Epoch different from the one its Facts were built under must discard its Facts and its cursor and
   resync from empty. Without this, an Actor whose Journal was reset folds a fresh Log on top of an
   old one and shows both sets of entities forever.
2. **First sync delivers the current set, retractions included.** A retraction is how an Actor that
   was away learns of a deletion; omit tombstones and deleted entities become immortal on every
   Actor that missed them.
3. **Every Datom is delivered with a resumable cursor equal to its `tx`.** Resumption needs no
   state beyond the last cursor seen, because `tx` is already the position.
4. **Nothing that is not a Datom carries a cursor.** A heartbeat, a clock tick, or an Epoch
   announcement must not advance a cursor. Giving a clock tick a cursor makes an Actor skip Datoms
   on its next resume. This is easy to get wrong and silent when wrong.
5. **Server time is delivered before an Actor may mint** (section 4.2).
6. **Every valid Datom is journalled; only winners are broadcast.**
7. **Rejection is limited to validation and future `tx`.** A Datom is rejected when it is
   malformed, names an unknown attribute, mismatches its attribute against its entity type, carries
   an invalid value, or carries a `tx` more than a small bounded interval in the future. A past `tx`
   is harmless because it loses. A future `tx` is poison because it wins everything until wall time
   catches up. A Datom is never rejected for conflicting (section 1.4).
8. **A stale cursor must still converge.** Efficiency rules about which cursor to prefer are not
   correctness rules, and an implementation must prove convergence from a stale one.

## 3.2 The reference implementation

Server-Sent Events downward with the event id carrying `tx`, HTTP POST upward carrying an outbox.
The stream opens with an epoch event, sends the current set, then live Datoms, with periodic clock
events that deliberately carry no id.

Other transports conform when they meet section 3.1. HTTP streaming and peer-to-peer transports
such as Iroh are expected candidates as the reference implementation grows a second Actor that is
not a browser.

## 3.3 An Actor holds the whole current set

**Status: Proven.**

An Actor's Facts must be the App's entire current set. Partial subscription is not part of this
spec (Appendix A.1).

This is not a limitation, it is what makes the rest work. One Owner's facts are bounded by what one
party produces. A whole set in memory is what makes a Read Model an ordinary function rather than a
query plan, what makes an Index buildable locally, and what makes the Owner's own data available
when the Journal is not.

## 3.4 Datoms stay small; large content is referenced

**Status: Adopted.**

A Datom's value must be small. Content that is not must live in a Blob Store and be named in the
Datom by a Content Address, fetched on demand as a Lazy Value.

Without this rule, section 3.3 collapses the first time an Owner stores a document: every Actor
would hydrate every document to show a title. With it, the fact set stays the size of the Owner's
facts, and disclosure is progressive at the value level rather than the fact level. Content
addressing also means a Lazy Value is immutable and cacheable forever, and a Message can carry a
reference to content without carrying the content.

## 3.5 Indexes are derived, never synced

**Status: Adopted.**

Embeddings, full-text postings, and graph adjacency are Read Models (section 5.4). They must not be
Datoms and must not be synced. Each Actor rebuilds or requests what it needs.

A vector embedding is derived data whose source is already in the Log. Storing one as a fact would
put thousands of floats per entity into a set that every Actor holds, and would make the Log's size
a function of a model choice that will change.

---

# 4. Actors

## 4.1 What an Actor is

**Status: Proven.**

An Actor holds Facts, hosts Read Models, and runs Commands. Kinds of Actor include the Journal, a
browser client, a native client, and an agent running in its own process. The kind is not
architecturally significant: what an Actor holds and may do is the same in every case.

The Journal is the Actor that holds the Log, and its Facts are the Log itself, folded on startup.
The Journal is the only writer to the Log.

**Only Actors of an App write to that App's Log.** Nothing from another App reaches a Log except as
a Message that the receiving Owner's Command turns into Datoms (section 6). This is what makes the
rationale in section 1.4 hold: every Datom in a Log is its Owner's own intent.

## 4.2 Minting

**Status: Proven.**

1. An Actor must mint `tx` from the last known server time plus elapsed monotonic time. It must
   never read the local wall clock. A device with a wrong clock would otherwise poison every
   conflict it takes part in, and clock skew across an Owner's own devices is normal.
2. An Actor must not mint before it has received server time. In a user-facing Actor this means
   editing is disabled until the first clock arrives. The sync protocol delivers the current set
   before it delivers server time, so having a clock also means having the state that came with it.
3. A Journal must reject a `tx` more than a small bounded interval in the future (five seconds in
   the reference implementation).

## 4.3 Commands

**Status: Proven.**

A Command is the only thing that mints a Datom. No Read Model, no render, and no sync path may
mint.

**A Command that modifies an entity must first verify that the entity still exists in the Actor's
current Read Model.** Section 1.3 makes re-assertion of a defining attribute restore a deleted
entity, which is correct at the storage layer and wrong as an accident. Without this check, an
editor that was open when the entity was deleted elsewhere resurrects it on its next settle.
Creating an entity is a separate explicit Command using a newly minted identity, never a re-assertion.

## 4.4 The outbox

**Status: Proven** for the in-memory outbox, **Adopted** for the durable one.

An Actor holds minted Datoms in an outbox until the Journal acknowledges them. The reference
implementation keeps the outbox in memory, so offline edits drain on reconnect but do not survive a
reload. That is a stated non-goal of the reference implementation, not of the architecture.

An Actor may persist its outbox. Last-write-wins makes this safe by construction: a Datom replayed
from a persisted outbox after a long delay simply loses, exactly as it would have if delivered
late. No other rule changes.

Persisting Facts themselves is a different matter and is not covered here, because persisted Facts
plus an Epoch change is a trap that needs its reset path designed first.

---

# 5. Read Models

## 5.1 There is no query language

**Status: Proven.**

A Read Model is a pure function from Facts to a typed structure, written in the host language. Every
consumer reads a Read Model. An App must not require a separate query language to answer its own
questions.

The reasoning is that a language model's strongest skill is writing code, and a bespoke query
written against the specific context at hand beats a generic query language forced to serve every
use case. A query language is also a second thing to learn, a second thing to validate, and a second
place for types to stop being checked. Since the whole current set is in memory (section 3.3), a
fold is fast and a Read Model is an ordinary, testable, typed function.

An ad hoc question is an unmemoized Read Model. An App may have many Read Models, each owned by the
consumer that needs it, and an agent may write a new one as ordinary code.

## 5.2 The store interface

**Status: Proven.**

Facts must expose a small, stable interface, and it is the floor every Read Model is built on:

```text
apply(datom)        -> whether the Datom won
datomsSince(tx?)    -> currently winning Datoms newer than tx, in ascending tx order
readModel()         -> the memoized projection
subscribe(listener) -> notified when a Datom wins
clear()             -> forget everything, for an Epoch change
```

This is not a query language. It is the minimum that makes "write the query as code" portable: name
it and an agent has a stable surface to write against in any App; leave it unnamed and every App
invents a different one.

The same fold and the same projection must run in every Actor, from one shared definition. If the
Journal and a client project differently, they disagree about what the Log means, and no amount of
testing on either side finds it.

## 5.3 Engines

**Status: Adopted.**

A Read Model may be hosted by any Read Model Engine, and the Engine's native query surface is that
Read Model's interface. An in-memory fold is one Engine. An embedded SQL database projected from
the fact set is another, and SQL is then a perfectly good way to ask it questions.

This is how the spec gets the convenience of a query language without specifying or implementing
one. The constraint is the same for every Engine: **derived, rebuildable from the Log, never a
source of facts.** An Engine that accepts a write that did not come from a Datom has become a second
Log, and the App now has two truths.

## 5.4 Search is a Read Model

**Status: Adopted.**

Graph, full-text, and vector search are Read Models hosted by Engines suited to them.

The graph needs no construction at all: composition ids and reference attributes (section 1.5) are
already the edges, so graph traversal is a Read Model that walks the fact set. Full-text and vector
Indexes are built from attribute values and Lazy Values, rebuilt by replay, and queried through
their Engine. Which specific engines fit cleanly is an open question (Appendix A.2); that they are
Read Models rather than storage is not.

## 5.5 Context Projection

**Status: Adopted.**

A Context Projection is a Read Model whose output is prose for a language model or a human: the
state of a project rendered as a briefing, an agent's memory rendered from the facts it asserted, a
glossary rendered from term entities.

It must be generated from facts and must not be hand-edited. This is section 5.1 with a string as
its output type, so it costs no new machinery, and it closes a specific and common failure: prose
that a model reads about the Owner's state drifting away from the Owner's actual state. Because it
is derived, it cannot drift, and because the facts behind it are in the Log, any claim in it can be
traced.

"Memory" has a precise meaning under this rule: facts an agent asserted about its own work,
projected back to it as context.

---

# 6. Messages between Apps

**Status: Adopted** for the boundary rule, **Hypothesis** for the protocol (Appendix A.4).

An Actor of one App may send a Message to an Actor of another App. A Message is input. It must not
write to the receiving Log. The receiving Owner's Command decides what, if anything, becomes fact.

A Message may carry entity ids and Content Addresses as ordinary values, which is how two Apps refer
to the same content without sharing a Log: the Content Address is meaningful in both, and the Blob
Store it names can be fetched by either.

This is the whole multi-Owner story, and it is deliberately the only one. Two Owners never share a
Log, so the single-Owner rationale for last-write-wins (section 1.4) is never violated by
collaboration. Collaboration is asynchronous, explicit, and mediated by each Owner's own Commands.
An Owner's App is the boundary of their accountability, and a Message is the only thing that crosses
it.

---

# 7. Schema and evolution

## 7.1 One definition, two checks

**Status: Proven.**

One schema definition must yield both the compile-time type and the runtime validator, so the two
cannot diverge. Every Datom is checked twice: by the compiler where code constructs it, and by the
validator where it crosses a boundary.

The validator checks entity id shape, attribute membership, attribute-to-entity-type agreement, and
value type and range. The Journal and every Actor must use the same definition verbatim.

The principle behind it is that the architecture should make the correct thing easy and the wrong
thing hard. Types do that at the moment code is written, which is when a language model is working.
Runtime validation does it at the moment data arrives, which is when trust ends. Neither alone is
enough: a type is not present at runtime, and a validator is not present while code is being
written.

## 7.2 Evolution is add-only

**Status: Adopted.**

1. Attributes are **add-only**. A new attribute may be introduced at any time.
2. An attribute must **never be renamed and never be retyped**. Renaming is introducing a new
   attribute, teaching Read Models to prefer it, and retiring the old one.
3. A retired attribute **remains valid in the Log forever** and is simply ignored by Read Models.
4. **The Log is never migrated.** No rewriting, no backfill, no transformation of history.
5. The schema carries a version. An Actor whose schema is newer than the Journal's must be refused,
   so a Journal never records what it cannot validate.

This is the only evolution policy compatible with an append-only Log and with deterministic replay.
Rewriting history to fit a new schema destroys the property every Read Model and every Index depends
on. The cost is that retired attributes accumulate in the schema as documentation of what the Log
contains; that is the correct place for that cost, because the Log does contain them.

---

# 8. UI to model

**Status: Proven.** Timing values are reference values, not rules.

## 8.1 Three state owners

Every piece of state in a user-facing Actor has exactly one owner:

| State | Owner |
| --- | --- |
| In-flight edits not yet minted | The component holding the input |
| Everything derived from facts | A Read Model |
| Connection, pending writes, saving, failure | Client status |

A piece of state with two owners is a bug waiting for a race to reveal it.

## 8.2 Minting granularity

Continuous input mints on **settle**: idle for a short interval, blur, or commit, whichever comes
first. Discrete actions mint immediately.

Without this, typing a twenty-character value mints twenty Datoms, nineteen of them superseded
within a second, and section 1.2 leaves no envelope to group them in. Leaving a field settles rather
than discards, so an edit survives navigation.

Settling is a persistence boundary, not a durability guarantee for the text inside the settling
window. A reload before the timer fires restores the previously settled value. Durable in-flight
drafts need a lifecycle and conflict semantics that product evidence should justify before they are
built.

Reference values: 500ms idle to settle, 300ms before a saving indicator appears. The second exists
because settle-grained minting drains the outbox in tens of milliseconds and an undelayed indicator
flickers on every keystroke boundary. Both belong in the Actor, not in a selector, so the selector
stays pure and each delay is testable alone.

## 8.3 Status is a pure selector

Delivery status must be a pure function of client status to a single presentable state, with
structured failures carrying message, code, transport status, and stable issue paths.

An outbox that cannot drain must report that it is waiting, even while the stream is nominally open,
because delivery is what the Owner cares about and a permanent "saving" is a lie.

---

# 9. The engineering system

**Status: Proven.** Properties are normative; the tools are the reference implementation.

An architecture that resists slop is not only a data model. These properties are what keep a
codebase honest when much of it is written by a language model, and each maps to a specific failure.

1. **One command defines done.** A single command whose green result is the definition of done,
   identical locally and in CI. Without one, "done" is a judgement call, and a judgement call under
   time pressure is always yes.
2. **Two daily tiers.** A fast tier (seconds) after each step, and the full tier before claiming
   done. One tier alone is either too slow to run or too weak to trust.
3. **Gates only ever tighten.** Loosening a threshold, skipping a test, or excluding a rule to make
   a run pass is forbidden. Raising a gate is deliberate work with its own commit. This is the
   single most important rule in this section: every other gate is only as strong as the prohibition
   on quietly weakening it.
4. **Coverage is a lockfile, not a target.** It records the exact evidence the suite proves today,
   and it changes only through an explicit update command after review. A target invites gaming; a
   lockfile makes an unexplained change visible in a diff.
5. **Every production file has exactly one named evidence owner**, recorded in a registry with a
   rationale, stating which kind of test is responsible for it. Missing ownership is a failure.
   This is what stops code from being added that nothing exercises, which is the most common form of
   generated slop.
6. **Literals with meaning are named**, and configured shared contracts derive from their canonical
   export rather than repeating its value. Enforced, without auto-fix, because choosing a name is a
   design act.
7. **Documentation is three things with fixed jobs**: a glossary of domain language with no
   implementation in it, short decision records saying what was chosen and why and what is now
   forbidden, and one living narrative of how the system works. Generated reference, such as the
   list of what each verification stage runs, is generated from the thing that executes so it cannot
   drift.

The reference implementation realises these with a Node test runner, Storybook for component states
and accessibility, Playwright for assembled journeys, and Lighthouse for delivered quality. An App
on another stack conforms by meeting the properties.

---

# 10. Non-goals

These are choices with reasons, not gaps to be filled later without thought.

| Non-goal | Why |
| --- | --- |
| Multi-Datom transactions | Section 1.2. Defining-attribute ordering covers the real case. |
| Conflict detection, rebase, server sequence, CRDT merge | Section 1.4. Each ends byte-identical Datoms and zero idempotency bookkeeping. |
| A second event vocabulary over Datoms | Section 1.1. Two event shapes means two projections and two migration stories. |
| Authentication and authorization | Undecided, not rejected. Until it exists, a losing write cannot be distinguished from a hostile one. An App exposed beyond its Owner needs this first. |
| Multiple concurrent writers to one Log | The Journal is the only writer. Section 1.4's rationale assumes one Owner. |
| Collaborative real-time text editing | Section 1.4, limit 4. |
| Partial fact subscription | Section 3.3 and Appendix A.1. |
| Querying the Log through a query language | Section 5.1. |
| Migrating the Log | Section 7.2. |

---

# Appendix A: Hypotheses

Not normative. Each states what it is, the trigger that would promote it, and what it must preserve.

**A.1 Partial fact subscription.**
An Actor subscribes to a subset of the fact set rather than all of it.
_Trigger_: an App's fact count exceeds what a needed Actor can hold or hydrate, after section 3.4's
Lazy Values have already moved large content out.
_Must preserve_: Epoch-and-reset semantics, tombstone delivery for the subscribed subset, and a
cursor that still means a position. Needs a subscription protocol that does not exist, and a new
word, because an Actor holding a subset is not holding the current set.

**A.2 Vector and full-text Read Model Engines.**
Specific engines for similarity and text search over attribute values and Lazy Values.
_Trigger_: an Owner needs search that a fold over the fact set cannot answer at acceptable speed.
_Must preserve_: section 5.3's constraint that an Engine is rebuildable from the Log and never a
source of facts, and section 3.5's rule that Indexes are not Datoms. The open question is whether any
engine rebuilds cleanly enough by replay to keep that honest.

**A.3 Schema inference from existing Datoms.**
A development-time tool that proposes a schema from the facts an App already holds.
_Trigger_: schema drift becomes a real maintenance cost as attributes accumulate.
_Must preserve_: inference proposes, the Owner's schema-as-code disposes. The Log must never become
the source of truth for its own validation, or an invalid Datom that got in would retroactively
legitimise itself.

**A.4 The Message protocol.**
How a Message is addressed, delivered, authenticated, and turned into a Command.
_Trigger_: a second App exists to talk to.
_Must preserve_: section 6's rule that a Message never writes to the receiving Log. Almost certainly
needs authentication, which is currently a non-goal, so this probably follows rather than precedes
that decision.

**A.5 The Owner's knowledge layer.**
The larger ambition behind the spec: an App that is the best single-Owner knowledge and data layer
precisely because one party owns presentation, functionality, and data together, with humans, language
models, and systems each doing what they are good at, reasoning where reasoning is needed and
determinism everywhere else.
_Trigger_: this is a direction, not a feature. It is promoted piece by piece as A.1 through A.4 are.
_Must preserve_: everything in the normative body. It is the reason for the body, not an extension
of it.

**A.6 Alternative transports.**
HTTP streaming, or a peer-to-peer transport such as Iroh, in place of Server-Sent Events.
_Trigger_: an Actor that is not a browser, or an Actor-to-Actor path that should not route through
the Journal's HTTP surface.
_Must preserve_: all eight properties in section 3.1, in particular that nothing but a Datom carries
a cursor.

---

# Appendix B: Known limits of the reference implementation

Inherited on day one by anyone bootstrapping from this repository. These are implementation gaps,
not architectural choices.

| Limit | Consequence |
| --- | --- |
| Single-process Journal | No horizontal scaling of the writer. |
| Replay cost grows with history | No checkpoints and no compaction, so startup time grows with the Log forever. |
| No tombstone horizon | Retractions accumulate without bound in the current set, are iterated by every projection, and are rendered by none. |
| Hydration is quadratic | The fact set is re-projected once per streamed Datom during hydration. Measured: 500 Datoms 74ms, 1000 290ms, 2000 1.2s, 4000 4.6s, against roughly 2ms for a single projection at 4000. Compounded by the missing tombstone horizon. |
| Offline edits do not survive a reload | The outbox is in memory (section 4.4). |
| In-flight draft text is not durable | Text not yet settled is lost on a hard reload (section 8.2). |
| No authentication | Section 10. |

The first four are the ones to address before an App built this way holds a real Owner's working
history, and they are related: checkpoints, a tombstone horizon, and coalesced hydration are three
views of the same missing idea, which is a periodically materialised current set.

---

# Appendix C: Where the reference implementation does this

| Section | In this repository |
| --- | --- |
| 1.1 to 1.4 core model | [ADR 004](./adr/004-single-datom-log.md), [`docs/architecture.md`](./architecture.md) |
| 1.5 identity | [`docs/architecture.md`](./architecture.md), entity id section |
| 2 the Log | [`docs/architecture.md`](./architecture.md), persistence section |
| 3 sync | [`docs/architecture.md`](./architecture.md), API section; [ADR 008](./adr/008-structured-datom-delivery-failures.md) |
| 4 Actors and Commands | [ADR 007](./adr/007-ui-to-model-convention.md), [`docs/conventions/ui-to-model.md`](./conventions/ui-to-model.md) |
| 5 Read Models | `shared/src/datomStore.ts`, the shared runtime contract |
| 7 schema | `shared/src/datom.ts`, the shared schema |
| 8 UI to model | [ADR 007](./adr/007-ui-to-model-convention.md) |
| 9 engineering system | [`docs/testing-and-validation.md`](./testing-and-validation.md), [`docs/verify.md`](./verify.md), [ADR 006](./adr/006-test-execution-model.md), [ADR 010](./adr/010-producer-owned-coverage-evidence.md), [`docs/semantic-constants.md`](./semantic-constants.md) |

The reference implementation's `DatomStore` fuses Facts with one in-memory Read Model Engine. That
is correct for an App with a single Engine, and it is the seam to split when a second one arrives.

## Related docs

| Topic | Doc |
| --- | --- |
| How this app works | [`docs/architecture.md`](./architecture.md) |
| Accepted decisions | [`docs/adr/README.md`](./adr/README.md) |
| Domain language of this app | [`CONTEXT.md`](../CONTEXT.md) |
| Entry map | [`DECISIONS.md`](../DECISIONS.md) |
| The brief this spec came from | [`docs/research/reference-architecture.md`](./research/reference-architecture.md) |
