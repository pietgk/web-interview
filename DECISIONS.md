# Design decisions

This document captures **why** we made key choices in the Sellpy web interview assignment.
Tests encode the expected behaviour; this file explains the trade-offs behind the design.

## How to verify

```bash
# Unit + API integration (shared contract, backend, frontend)
npm test

# End-to-end (starts backend + frontend itself)
npm run test:e2e

# Lint + production build
npm run lint
npm run build --prefix frontend
```

Or per package: `npm test` / `npm run lint` inside `shared/`, `backend/`, and `frontend/`.

Playwright browsers (clean checkout): `npx playwright install chromium`

## Scope completed

- **Main:** Persist todo lists on the server (in-memory store)
- **Autosave:** No Save button; debounced persist on change, flush on list switch / blur / page hide
- **Completed items:** Toggle per todo
- **Completed lists:** Derived indicator when all items in a list are completed
- **Due dates:** Per-item date with remaining / overdue labelling (completed items show `Completed`)
- **Tests:** Shared contract, unit, API integration, and Playwright e2e including failure-path regressions

## Persistence: in-memory store, not a database

**Why:** The assignment explicitly allows a simple JS structure. An in-memory store keeps setup zero-friction for the interviewer (`npm start` in each package), keeps the demo focused on API design and frontend behaviour, and avoids drowning the PR in infra.

**Trade-off:** Data resets on server restart. Acceptable for this assignment; a DB would be the next step if durability across restarts mattered.

## API: whole-list `PUT`, not fine-grained item endpoints

**Why:** The existing UI already saved an entire list’s todos in one shot (`saveTodoList(id, { todos })`). One write path keeps autosave simple, avoids N endpoints for N actions, and matches a single source of truth for a list on the server.

**Trade-off:** Concurrent editors could overwrite each other. Fine for a single-user demo; `PATCH` per item (or ETags) would be a natural evolution. Same-tab overlapping saves are handled by a per-list serialized client queue.

## Runtime contract: shared Zod package

**Why:** Handwritten type checks accepted impossible dates and duplicate IDs. Zod makes the HTTP boundary executable and testable. `@web-interview/todo-contract` is consumed by both backend and frontend (CRA build verified without ejecting).

**Shape enforced:** non-empty unique todo ids, boolean `completed`, `dueDate` null or real `YYYY-MM-DD`, strict objects, structured `{ error, code, issues }` validation errors.

## List “completed” is derived, never stored

**Why:** Single source of truth. If both items and the list stored a completed flag, they could disagree. Deriving `every(todo => todo.completed)` (and requiring a non-empty list) makes the rule obvious and keeps the model small.

**UI source of truth:** Visible list state (including the completed indicator) is derived from the current **draft**, not the last server acknowledgement. Acknowledgements are metadata for persistence, not a second render model.

## Todos are objects with stable ids

**Why:** Strings cannot carry `completed` or `dueDate`. Stable ids give React reliable keys (replacing index-as-key) and make future per-item APIs easier without rewriting the client model.

Shape:

```js
{ id, text, completed, dueDate }
```

`dueDate` is `YYYY-MM-DD` or `null`.

## Autosave: XState actors per list

**Why:** Debounce must control network frequency, not the lifetime of user data. The
protocols around flush-on-switch, in-flight coalesce, retry, and type-to-create are
easier to prove and present as explicit statecharts than as an ad-hoc queue.

**Design:**

- `todoListsMachine` loads the catalog and spawns one `todoListMachine` per list
- Persistence states: `clean` → `dirty` → `saving` → `clean` | `error` (debounce via `after`)
- `TodoListForm` is controlled and emits intent events only
- Flush on list switch, blur, and `pagehide`; warn on `beforeunload` while unacked
- Failed saves stay dirty and expose an accessible **Retry** action
- Details + diagrams: [`docs/adr/002-xstate-actors.md`](./docs/adr/002-xstate-actors.md)

## Ghost composer (type to create)

**Why:** An Add button is clumsy for a todo list. Users expect to start typing on an
empty top row.

**Design:** Local composer until the first non-whitespace character, then a linked draft
todo for the rest of the typing session. Clearing the linked composer dematerializes
unless `completed` or `dueDate` is set. Numbered rows keep empty text on clear so
clear-then-type still works. See ADR 002.

## Due-date formatting uses structured status + injectable “now”

**Why:** Remaining/overdue labels must be deterministic in unit tests. `getDueStatus` returns `{ kind, label, days }` so colour is based on `kind`, not string matching. Completed todos are labelled `Completed`, never overdue.

## Test pyramid

| Layer | Role |
|-------|------|
| Shared contract (`shared/`) | Zod schema rules once |
| Unit (model, XState actors, components) | Fast spec for pure rules and failure paths |
| Integration (supertest + Express app) | HTTP contract and persistence |
| E2E (Playwright) | A few complete user journeys across refresh and list switching |

**Backend runner:** Node’s built-in `node:test` — no extra test-runner dependency on the server.

**Story for the interview:** Tests are the living spec. Red → green → refactor. Failure-path regressions (list switch, ordering, retry, validation, completed-due) are first-class.

## Knowingly out of scope / deferred

- Authentication / multi-user / server ETags
- Creating or deleting whole lists
- Real database
- Multi-tab sync / conflict resolution
- Global Redux-style stores (XState actors cover this surface)
- React 19 / Suspense modernization (separate change; does not fix mutation ordering)
- Immutable.js (plain objects + functional updates are enough here)
