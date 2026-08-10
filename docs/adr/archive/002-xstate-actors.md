# ADR 002: XState actors for todos and autosave

## Status

Superseded by [ADR 003](./003-shared-datom-actor.md)

## Context

Autosave, list switching, overlapping PUTs, retries, and the “type to create” composer
are stateful protocols with many edge cases. A reducer + imperative save queue worked,
but the control flow was harder to present and easy to get subtly wrong when extending UX.

We also wanted a modern create path: type in an empty top row; the first non-whitespace
character materializes a todo; Enter / the trailing Add button commits the row; clearing
an empty linked composer dematerializes it.

## Decision

Model the frontend as an XState v5 actor hierarchy:

- `todoListsMachine` loads the catalog, owns selection, and spawns one child actor per list.
- Each `todoListMachine` owns its draft, composer, revision, and persistence lifecycle.
- A child debounces in `dirty`, invokes one PUT in `saving`, and immediately saves a
  newer revision after the current request finishes.
- Different lists may save concurrently. Each individual list remains serialized.

React stays a thin boundary. `useTodoLists` exposes the catalog snapshot and actor refs.
Navigation rows and the active editor subscribe directly to their owning actor with
`useSelector`. `TodoListForm` still emits intent events through a single `send` prop.
Domain helpers stay in `todoModel.js`. HTTP stays in `api/todoLists.js`.

### State / event table

Copied from the machine definition - update this table whenever `states` / `on` keys change.
Live diagrams belong in the Stately Inspector, not hand-drawn mermaid here.

Catalog actor:

| State | Events handled | Notes |
|-------|----------------|-------|
| `loading` | invoke `loadLists` | Stops old children; success spawns fresh list actors |
| `ready` | `SELECT_LIST`, `FLUSH_ALL`, `RELOAD` | Flushes the previous child when selection changes |
| `error` | `RELOAD` | Load failure; retry returns to `loading` |

Per-list actor:

| State | Events handled | Notes |
|-------|----------------|-------|
| `clean` | edit events, `FLUSH` | A real draft change enters `dirty` |
| `dirty` | edit events, `FLUSH`, delayed autosave | Re-entering on edits resets the debounce |
| `saving` | edit events, `FLUSH`, invoke `saveList` | Newer drafts cause a fresh `saving` invocation after completion |
| `error` | edit events, `FLUSH`, `RETRY` | Draft remains available; edit debounces again and retry saves immediately |

The child state value is the persistence status. There is no duplicate status string or
global save queue in context.

### Ghost composer

Rules:

- Ghost text is local until the first non-whitespace character.
- That character prepends a real draft todo and **links** the composer to its id so
  continuous typing does not create one todo per keystroke.
- The linked todo is hidden from the list until `COMPOSER_COMMIT` / `COMPOSER_SUBMIT`.
- Enter and the trailing Add button both send `COMPOSER_SUBMIT` (commit link + clear composer).
- Clearing the **linked composer** dematerializes unless `completed` or `dueDate` is set.
- Existing rows keep empty text on clear (so clear-then-type edits work); use delete to remove them.
- Linked drafts are still included in PUT payloads (they are real draft state).

### Testing strategy

Actor tests use XState's `SimulatedClock` for debounce behavior and controlled promises for
request ordering and failures. Catalog tests exercise child spawning, flush-on-switch,
reload cleanup, and concurrent saves across different lists. React tests verify subscriptions
and user-visible behavior, while Playwright covers persistence through the real HTTP boundary.

XState's graph-based model test helper does not support invoked actors or delayed transitions.
Those are the core behaviors here, so a duplicate simplified model would provide weaker evidence
than deterministic tests against the production machines. Model-based testing should be
reconsidered if the finite interaction state grows independently of timers and promises.

### Inspector (demo)

In development, `@statelyai/inspect` is bootstrapped at app startup via `ensureInspector()`
so the Stately Inspector opens in a **new browser tab/window**. The actor hierarchy shows the
catalog and each list's real persistence state independently.

1. `npm start` in `frontend/`
2. Allow pop-ups for the app origin if the Inspector tab does not appear
3. Check the console for: `XState Inspector: opened in a new browser tab/window…`
4. Disable with `VITE_XSTATE_INSPECT=0`

Never enabled in `test` or production builds.

## Consequences

**Positive**

- Actor boundaries match ownership and concurrency in the domain.
- Persistence states are visible and enforceable instead of duplicated in context.
- Form is intent-only; save chrome is a selector over the child snapshot.
- Same-list writes are serialized while unrelated lists can save concurrently.
- Flush on switch, in-flight coalescing, and retry remain explicit transitions.

**Trade-offs**

- XState dependency and a slightly steeper onboarding curve.
- React components that render child state must subscribe to the relevant actor ref.

## Alternatives considered

- One catalog/editor/queue actor - compact React adapter, but it hides per-list states in
  context and requires manual timers, revisions, and global queue bookkeeping.
- Child actors plus a root `FORWARD` event - correct ownership, but unnecessary routing and
  manual React subscriptions. Direct actor refs plus `useSelector` remove that indirection.
- Keep reducer plus `createSaveQueue` - less inspectable for protocol edge cases.
- React Query or SWR - poor fit for debounced whole-list PUT with local revisions.
- Hand-drawn Mermaid in the ADR - likely to drift; the Inspector and tables stay closer to code.
