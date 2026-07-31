# Design decisions

This document captures **why** we made key choices in the Sellpy web interview assignment.
Tests encode the expected behaviour; this file explains the trade-offs behind the design.

## How to verify

```bash
# Unit + API integration
npm test

# End-to-end (starts backend + frontend itself)
npm run test:e2e

# Lint
npm run lint
```

Or per package: `npm test` / `npm run lint` inside `backend/` and `frontend/`.

## Scope completed

- **Main:** Persist todo lists on the server (in-memory store)
- **Autosave:** No Save button; debounced persist on change
- **Completed items:** Toggle per todo
- **Completed lists:** Derived indicator when all items in a list are completed
- **Due dates:** Per-item date with remaining / overdue labelling
- **Tests:** Unit, API integration, and a small Playwright e2e suite

## Persistence: in-memory store, not a database

**Why:** The assignment explicitly allows a simple JS structure. An in-memory store keeps setup zero-friction for the interviewer (`npm start` in each package), keeps the demo focused on API design and frontend behaviour, and avoids drowning the PR in infra.

**Trade-off:** Data resets on server restart. Acceptable for this assignment; a DB would be the next step if durability across restarts mattered.

## API: whole-list `PUT`, not fine-grained item endpoints

**Why:** The existing UI already saved an entire list’s todos in one shot (`saveTodoList(id, { todos })`). One write path keeps autosave simple, avoids N endpoints for N actions, and matches a single source of truth for a list on the server.

**Trade-off:** Concurrent editors could overwrite each other. Fine for a single-user demo; `PATCH` per item (or ETags) would be a natural evolution.

## List “completed” is derived, never stored

**Why:** Single source of truth. If both items and the list stored a completed flag, they could disagree. Deriving `every(todo => todo.completed)` (and requiring a non-empty list) makes the rule obvious and keeps the model small.

## Todos are objects with stable ids

**Why:** Strings cannot carry `completed` or `dueDate`. Stable ids give React reliable keys (replacing index-as-key) and make future per-item APIs easier without rewriting the client model.

Shape:

```js
{ id, text, completed, dueDate }
```

`dueDate` is `YYYY-MM-DD` or `null`.

## Autosave via debounce (not every keystroke, not websockets)

**Why:** Saving on every keypress creates request storms and race conditions. Debouncing (~400ms) batches typing into one PUT while still feeling instant thanks to optimistic local state. Websockets/CRDT would be overkill for this scope.

**UX:** Immediate local update; background persist; Saving / Saved / Error feedback so failures are not silent.

**E2E note:** On localhost the PUT can finish before React paints “Saving…”. E2e therefore waits on the PUT network response (the real contract), not on that transient label.

## Due-date formatting uses an injectable “now”

**Why:** Remaining/overdue labels must be deterministic in unit tests. Passing `now` into a pure helper keeps calendar logic testable without freezing the system clock globally.

## Test pyramid

| Layer | Role |
|-------|------|
| Unit (`todoModel`, store, components) | Fast spec for pure rules while iterating |
| Integration (supertest + Express app) | Spec for HTTP contract and persistence |
| E2E (Playwright) | Spec for a few user journeys across refresh |

**Why this shape:** Unit/integration fail fast and guide design. A handful of e2e tests prove the story that matters in the interview (persist, complete, due) without a brittle wall of UI tests.

**Backend runner:** Node’s built-in `node:test` — no extra test-runner dependency on the server.

**Story for the interview:** Tests are the living spec. Red → green → refactor. Easy to prove behaviour while developing, and easy to extend live on-site by adding a failing test first.

## Knowingly out of scope

- Authentication / multi-user
- Creating or deleting whole lists
- Real database
- Multi-tab sync / conflict resolution
- Global state libraries (Redux, etc.) — React state + server is enough here
