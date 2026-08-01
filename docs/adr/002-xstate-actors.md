# ADR 002: XState actor for todos and autosave

## Status

Accepted

## Context

Autosave, list switching, overlapping PUTs, retries, and the “type to create” composer
are stateful protocols with many edge cases. A reducer + imperative save queue worked,
but the control flow was harder to present and easy to get subtly wrong when extending UX.

We also wanted a modern create path: type in an empty top row; the first non-whitespace
character materializes a todo; Enter / the trailing Add button commits the row; clearing
an empty linked composer dematerializes it.

## Decision

Model the frontend with **one XState v5 actor** (`todoListsMachine`):

- Load the catalog (`loading` → `ready` | `error`)
- Hold every list’s draft, composer, revisions, and persistence `status` in context
- Debounce writes with a cancelable delayed `SAVE_DUE` event; run PUTs through a small
  save queue under `ready.watching` / `ready.saving`

React stays a thin boundary: `useTodoLists` exposes `send` + `selectViewModel(snapshot)`.
Components emit flat intent events. Domain helpers stay in `todoModel.js`. HTTP stays in
`api/todoLists.js`.

### State / event table

Copied from the machine definition — update this table whenever `states` / `on` keys change.
Live diagrams belong in the Stately Inspector, not hand-drawn mermaid here.

| State | Events handled | Notes |
|-------|----------------|-------|
| `loading` | (invoke `loadLists`) | Entry resets catalog; success → `ready`, failure → `error` |
| `ready` | `COMPOSER_CHANGE`, `COMPOSER_COMMIT`, `COMPOSER_SUBMIT`, `TODO_PATCH`, `TODO_REMOVE`, `RELOAD` | Shared edit handlers for the active list |
| `ready.watching` | `SELECT_LIST`, `SAVE_DUE`, `FLUSH_ACTIVE`, `FLUSH_ALL`, `RETRY_SAVE` | `always` → `saving` when `saveQueue` is non-empty |
| `ready.saving` | `SELECT_LIST`, `SAVE_DUE`, `FLUSH_ACTIVE`, `FLUSH_ALL`, `RETRY_SAVE` + invoke `saveList` | Edits still apply; newer drafts re-queue after ack |
| `error` | `RELOAD` | Load failure; retry returns to `loading` |

Per-list persistence `status` in context (not nested actors): `clean` → `dirty` → `saving` → `clean` | `error`.

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

### Inspector (demo)

In development, `@statelyai/inspect` is bootstrapped at app startup via `ensureInspector()`
so the Stately Inspector opens in a **new browser tab/window**.

1. `npm start` in `frontend/`
2. Allow pop-ups for the app origin if the Inspector tab does not appear
3. Check the console for: `XState Inspector: opened in a new browser tab/window…`
4. Disable with `REACT_APP_XSTATE_INSPECT=0`

Never enabled in `test` or production builds.

## Consequences

**Positive**

- One explainable actor: events in, snapshot out — strong interview narrative.
- Form is intent-only; save chrome is a selector over the snapshot.
- Same failure-path guarantees as before (flush on switch, coalesce, retry).

**Trade-offs**

- XState dependency and a slightly steeper onboarding curve.
- Per-list persistence status lives in context; inspect live transitions in the Inspector.

## Alternatives considered

- Keep reducer + `createSaveQueue` — less demoable for protocol edge cases.
- Per-list child actors + `FORWARD` — too much indirection for this interview surface.
- React Query / SWR — poor fit for debounced whole-list PUT with local revisions.
- Hand-drawn mermaid in the ADR — drifts from the machine; Inspector + table instead.
