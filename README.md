# NoNoThing SomeThings ToDo

DoNoThing SomeThing ToDo (Wip title) repo with the web interview based main task and all four additional tasks completed.

Todo lists and todos persist on the server, autosave without a save button, and converge across
browser tabs in real time. Every edit becomes one immutable [datom](https://docs.datomic.com/whatis/data-model.html#datoms) in an append-only log, which is
journalled to disk and streamed to every connected client.

## The assignment

Improve the todo list application. As given, it can only create and remove todos, and nothing is
persisted, so all state is cleared on refresh. The brief asks for the main task plus **at least
two** of the four additional tasks.

**Main task.** Persist the todo lists on the server. A database is not required.

**Additional tasks.**

- Don't require users to press save when an item is added or edited. (Autosave)
- Make it possible to indicate that a todo is completed.
- Indicate that a todo list is completed if all todo items within are completed.
- Add a date for completion to todo items. Indicate how much time is remaining or overdue.

## What was built

All five. Deliberate interview discussion surfaces beyond a brief-sized solution:

- Persist todo lists across server restarts in an append-only JSONL journal
- Autosave: no Save button; edits mint one datom when a field settles
- Real-time convergence across multiple clients and browser tabs
- Completed items (toggle per todo) and completed lists (derived when every item is completed)
- Todo List lifecycle: create, rename, and delete whole lists in one datom each
- Due dates: remaining and overdue labels; completed items shown as `Completed`
- StatusBar: one global connection, delivery, and recovery surface
- Seam-based tests, Storybook play for components, thin Playwright

A brief-sized solution could stop at an in-memory server store, ordinary API writes, and
settle-based autosave. The assignments quality matters remark and the mentioned optional parts triggered 
the datom journal, live convergence, session outbox, Todo List lifecycle,
and automatic ordering to make consistency, failure semantics, durability, and UX trade-offs
observable.  Some of it is more than asked for and created for discussion during the interview.

![Product architecture: UI to model to datoms](./docs/architecture.svg)

The same diagram is editable as an Excalidraw scene: `npm run whiteboard` opens Excalidraw.

## Running it

### Install

Three installs from the repo root, plus a browser. This is exactly what CI runs:

```bash
npm ci
npm ci --prefix backend
npm ci --prefix frontend
npx playwright install chromium
```

Backend and frontend keep their own lockfiles, so the root install does not reach them: `react`,
`@mui/material` and `express` live only in those trees. The last line installs the browser the
Storybook and Playwright stages run in, and is only needed on a clean machine.

`shared/` needs no install of its own. Backend and frontend pull it in through `file:`
dependencies and the root depends on it the same way, so its dependencies land in the root tree.
The root `postinstall` then generates the shared package declarations that editors and `typecheck`
read. Regenerate them explicitly with `npm run build:types`.

### Start

Run `npm start` in `backend/`, then in `frontend/`. A browser tab opens automatically on the
frontend.

| From the repo root | What it does |
| --- | --- |
| `npm run storybook` | Components in isolation, with HMR |
| `npm run preview` | Interactive demo: drives the app, and can stop the backend mid-session to show reconnect and outbox drain. click the client links a few times to get multiple sessions. |
| `npm run kill` | Frees every port this repo binds |

Storybook source-file links open in Zed. To use VS Code instead, change `LAUNCH_EDITOR=zed` in
`frontend/package.json` to `LAUNCH_EDITOR=code` and make sure the `code` CLI is on `PATH`.

## Verifying

The complete testing and validation model lives in [`docs/testing-and-validation.md`](./docs/testing-and-validation.md).
For humans, there are two primary commands:

| Command | Cost | What it does |
| --- | --- | --- |
| `npm run watch` | ~2s per change | Continuous Node test and typecheck feedback |
| `npm test` | ~70s | The complete authoritative verdict, in the same order as CI |

Selective verification remains available. Use `npm run verify help` for the current stage and step
names, or select a stage or step such as `npm run verify browser` or `npm run verify lint e2e`.
Agents must not start `npm run watch`, because it never exits.

`npm run lint` autofixes before it judges, so it will modify files.

## Why it is built this way

| Document | What it covers |
| --- | --- |
| [`DECISIONS.md`](./DECISIONS.md) | Entry map to architecture, ADRs, testing, and domain language |
| [`CONTEXT.md`](./CONTEXT.md) | Domain glossary: what Todo List, Todo and Next Due Date mean here |
| [`docs/adr/README.md`](./docs/adr/README.md) | Index of accepted and superseded architectural decisions |
| [`docs/architecture.md`](./docs/architecture.md) | How the system works (datom log, journal, SSE/POST, client, lifecycle) |
| [`docs/verify.md`](./docs/verify.md) | Verify tiers/stages; authoritative list via `npm run verify help` |

## Development set-up

This repo runs **Node 22**, pinned in `.nvmrc` and `mise.toml`. `verify` and `watch` refuse to run
on any other major rather than reporting results from a version the repo does not claim to
support.

ESLint is configured for every directory that is typechecked. In VS Code the standard
[ESLint plugin](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) picks
it up; `.vscode/settings.json` already sets the working directories. There is a `.prettierrc` so
Prettier users make no unnecessary changes.

You can open the repo root as one workspace, or `/frontend` and `/backend` separately. Both work.

Working notes for coding agents live in [`AGENTS.md`](./AGENTS.md); `CLAUDE.md` is a one-line
import of it, so both names give the same content.
