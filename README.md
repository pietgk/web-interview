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

- Per-list draft ownership (no silent loss on list switch)
- XState catalog + per-list actors for autosave + type-to-create ghost composer
- Shared Zod runtime contract
- Completion-aware due-date status

Design rationale: see [`DECISIONS.md`](./DECISIONS.md) and [`docs/adr/002-xstate-actors.md`](./docs/adr/002-xstate-actors.md).

**Live statecharts (dev):** `npm start` in `frontend/` opens the Stately Inspector in a
**new browser tab/window** (allow pop-ups for localhost if it does not appear). Check the
console for the Inspector bootstrap message. Diagrams live in the Inspector — the ADR keeps
a machine-derived state/event table instead of hand-drawn mermaid.
Set `VITE_XSTATE_INSPECT=0` to disable.

### Running tests

```bash
# from repo root (after npm ci in shared/, backend/, frontend/, and root)
npm test          # shared contract + backend + frontend unit
npm run test:e2e  # Playwright (starts both servers)
npm run lint
npm run build --prefix frontend
```

Playwright (clean checkout): `npx playwright install chromium`

## Submission
Before submitting, read through all changes one last time - **code quality matters**!

If you have developed without ESLint set up, run `npm run lint` in both `/backend` and `/frontend` and fix any errors/warnings.

Send a link to your forked repository to your contact at Sellpy. Don't forget to mention which tasks you completed.

Don't forget to bring your computer to the interview, as you'll need it to make code changes during the session!

## Prerequisites

NodeJS - if you don't already have it installed, check out [nvm](https://github.com/nvm-sh/nvm).

## Getting started
Fork the repository (see top-right button on GitHub) and clone the fork to your computer.

Shared Zod contract (`shared/`) is pulled in via `file:` dependencies from backend and frontend — install those packages after a clean clone:

### To start the backend:

 - Navigate to the backend folder
 - Run `npm ci`
 - Run `npm start`

### To start the frontend:

 - Navigate to the frontend folder
 - Run `npm ci`
 - Run `npm start`

 A browser tab will automatically open and load the app. In development the Stately
 Inspector also opens in a **new tab/window** for the todo actor hierarchy — allow
 pop-ups if you do not see it (see ADR 002). Set `VITE_XSTATE_INSPECT=0` to disable.

### End-to-end tests

From the repo root:

 - Run `npm ci`
 - Run `npx playwright install chromium` (first time / clean machine)
 - Run `npm run test:e2e`

### Development set-up
If you don't have a favorite editor we highly recommend [VSCode](https://code.visualstudio.com). We've also had some ESLint rules set up which will help you catch bugs etc. If you're using VSCode, install the regular [ESLint plugin](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) and you should be good to go!

You can open the root folder in one workspace, or `/frontend` and `/backend` in seperate workspaces - both should work fine.

Check `.nvmrc` to see what node version is required to run the project. Just run `nvm use` if you have `nvm` installed. Later versions of node might work fine as well, but probably not earlier versions.

For those of you using Prettier (not a requirement), there's an .prettierrc file to ensure no unnecessary changes to the existing code. It should be picked up automatically by Prettier.
