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

- Shared browser/server todo actor with immutable datom transactions
- Crash-safe, append-only JSONL persistence across server restarts
- Durable IndexedDB outbox for offline edits and reconnection
- Shared Zod runtime contract and deterministic read-model projection
- Completion-aware due-date status

Design rationale: see [`DECISIONS.md`](./DECISIONS.md) and
[`docs/adr/003-shared-datom-actor.md`](./docs/adr/003-shared-datom-actor.md).

### Running tests

```bash
# from repo root (after npm ci in shared/, backend/, frontend/, and root)
npm test          # shared contract + backend + frontend unit
npm run test:e2e  # Playwright (starts both servers)
npm run typecheck # check JavaScript and generated shared-package declarations
npm run lint
npm run build --prefix frontend
npm run quality:lighthouse # production desktop audit, scores, diagnostics, and budgets
```

Playwright (clean checkout): `npx playwright install chromium`

### Lighthouse quality

`npm run quality:lighthouse` builds the frontend with source maps, starts isolated seeded backend
and production-preview servers, and runs three desktop Lighthouse audits. The check requires
Performance, Accessibility, Best Practices, and SEO to remain at 100. It also guards the initial
JavaScript transfer and estimated unused JavaScript against explicit budgets.

The command writes a Markdown summary plus complete HTML and JSON reports to
`lighthouse-reports/`. CI publishes the summary on the workflow run and retains the reports as a
downloadable artifact for 14 days.

## Submission
Before submitting, read through all changes one last time - **code quality matters**!

If you have developed without ESLint set up, run `npm run lint` in both `/backend` and `/frontend` and fix any errors/warnings.

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
 - Run `npm run test:e2e`

### Development set-up
If you don't have a favorite editor we highly recommend [VSCode](https://code.visualstudio.com). We've also had some ESLint rules set up which will help you catch bugs etc. If you're using VSCode, install the regular [ESLint plugin](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) and you should be good to go!

Run `npm ci` from the repository root before opening the workspace. This installs the pinned TypeScript version and generates the shared package declarations used by editor tooling. Run `npm run build:types` whenever you want to regenerate them explicitly.

You can open the root folder in one workspace, or `/frontend` and `/backend` in seperate workspaces - both should work fine.

Check `.nvmrc` to see what node version is required to run the project. Just run `nvm use` if you have `nvm` installed. Later versions of node might work fine as well, but probably not earlier versions.

For those of you using Prettier (not a requirement), there's an .prettierrc file to ensure no unnecessary changes to the existing code. It should be picked up automatically by Prettier.
