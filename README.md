# Sellpy web interview

Welcome to Sellpy's web interview repo!

## Assignment
Your assignment is to improve this todo list application. At the moment the application is simple and can only create and remove todos.
As is, nothing is persisted in the server. As a result all state is cleared when refreshing the page!
Below follows one main task and 4 additional tasks. Your assignment is to complete the main task together with at least 2 out of 4 of the additional tasks.
If you feel constrained by time (which is totally fine!), **prioritize quality over quantity**.

### Main Task
Persist the todo lists on the server. Persisting in a database is not required, i.e. simple JS structures like objects/arrays that don't persist between server restarts are fine. If you do go for an actual DB (again not required), be sure to include instructions of how to get it up and running.

### Additional tasks
- Don't require users to press save when an item is added/edited in the todo list. (Autosave functionality)
- Make it possible to indicate that a todo is completed.
- Indicate that a todo list is completed if all todo items within are completed.
- Add a date for completion to todo items. Indicate how much time is remaining or overdue.

## Submission status (this fork)

Completed **main task + all 4 additional tasks**, plus the follow-up correctness work from [`01-REVIEW.md`](./01-REVIEW.md):

- Shared browser/server datom store folding an append-only log by last-write-wins
- Crash-safe, append-only JSONL persistence across server restarts
- Real-time convergence across clients and browser tabs over Server-Sent Events
- In-memory outbox that drains on reconnect within a session (edits do not survive a reload)
- Shared Zod runtime contract and deterministic read-model projection
- Completion-aware due-date status

Architecture overview (UI → model → datoms → how we verify)

```bash
npm run whiteboard   # opens excalidraw.com; File → Open docs/architecture.excalidraw
```

Design rationale: see [`DECISIONS.md`](./DECISIONS.md) and
[`docs/adr/004-single-datom-log.md`](./docs/adr/004-single-datom-log.md).

### Running tests

Two commands. Leave the first open while you work; run the second before you commit.

```bash
# from repo root (after npm ci in root, shared/, backend/, and frontend/)
npm run watch     # ~2s per change: all Node + happy-dom tests and typecheck, one GREEN/RED line
npm run verify    # ~70s: everything CI runs, in the order CI runs it
```

`verify` goes through four stages and stops at the first one that fails, because a failure makes
the stages after it meaningless:

| Stage | Runs | Nothing runs until | Time |
| --- | --- | --- | --- |
| `static` | typecheck, lint, audit | - (nothing executes) | ~4s |
| `unit` | shared, backend, frontend logic, scripts | Node | ~2s |
| `browser` | Storybook play + a11y, Playwright | real Chromium | ~24s |
| `quality` | build, Lighthouse, coverage | a production bundle | ~40s |

Run any part of it by name, and ask it what it does:

```bash
npm run verify browser     # one stage
npm run verify lint e2e    # any mix of stages and steps
npm run verify help        # what every stage and step covers
```

Other commands:

```bash
npm run storybook   # component loop, with HMR
npm run preview     # scripted demo of the running app
npm run whiteboard  # open Excalidraw; edit docs/architecture.excalidraw there
npm run kill        # free every port this repo binds
```

Coverage is merged from the `unit` and `browser` stages and judged in `quality`. The headline
prints on the `coverage` row; `open coverage/index.html` for the per-file, per-line detail.

This repo runs **Node 22** (`.nvmrc`). `verify` and `watch` refuse to run on anything else.
Playwright on a clean checkout: `npx playwright install chromium`.

Why it is shaped this way: [`docs/adr/006-test-execution-model.md`](./docs/adr/006-test-execution-model.md).

### Lighthouse quality

`npm run verify quality` builds the frontend with source maps, starts isolated seeded backend
and production-preview servers, and runs three desktop Lighthouse audits. The check requires
Performance, Accessibility, Best Practices, and SEO to remain at 100. It also guards the initial
JavaScript transfer and estimated unused JavaScript against explicit budgets.

The command writes a Markdown summary plus complete HTML and JSON reports to
`lighthouse-reports/`. CI publishes the summary on the workflow run and retains the reports as a
downloadable artifact for 14 days.

## Submission
Before submitting, read through all changes one last time - **code quality matters**!

If you have developed without ESLint set up, run `npm run lint` from the repo root and fix any errors/warnings.

Send a link to your forked repository to your contact at Sellpy. Don't forget to mention which tasks you completed.

Don't forget to bring your computer to the interview, as you'll need it to make code changes during the session!

## Prerequisites

NodeJS - if you don't already have it installed, check out [nvm](https://github.com/nvm-sh/nvm).

## Getting started
Fork the repository (see top-right button on GitHub) and clone the fork to your computer.

The shared package is pulled in via `file:` dependencies from backend and frontend. Install those packages after a clean clone:

### To start the backend:

 - Navigate to the backend folder
 - Run `npm ci`
 - Run `npm start`

### To start the frontend:

 - Navigate to the frontend folder
 - Run `npm ci`
 - Run `npm start`

 A browser tab will automatically open and load the app.

### End-to-end tests

From the repo root:

 - Run `npm ci`
 - Run `npx playwright install chromium` (first time / clean machine)
 - Run `npm run verify e2e`

### Development set-up
If you don't have a favorite editor we highly recommend [VSCode](https://code.visualstudio.com). We've also had some ESLint rules set up which will help you catch bugs etc. If you're using VSCode, install the regular [ESLint plugin](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) and you should be good to go!

Run `npm ci` from the repository root before opening the workspace. This installs the pinned TypeScript version and generates the shared package declarations used by editor tooling. Run `npm run build:types` whenever you want to regenerate them explicitly.

You can open the root folder in one workspace, or `/frontend` and `/backend` in seperate workspaces - both should work fine.

Check `.nvmrc` to see what node version is required to run the project. Just run `nvm use` if you have `nvm` installed. Later versions of node might work fine as well, but probably not earlier versions.

For those of you using Prettier (not a requirement), there's an .prettierrc file to ensure no unnecessary changes to the existing code. It should be picked up automatically by Prettier.
