# Working agreement

Instructions for any coding agent working in this repo. `CLAUDE.md` is a one-line import of this
file, so both names resolve to the same content and there is nothing to keep in sync. Put changes
here.

## Node

This repo runs **Node 22** (`.nvmrc`, `mise.toml`, `engines`). mise does not activate in
non-interactive shells, so run commands through it:

```bash
mise exec node@22 -- npm run verify
```

`verify` and `watch` refuse to run on the wrong major rather than producing results from a Node
the repo does not claim to support.

## Which command, when

Full reference: `npm run verify help`. It is generated from the table `verify.mjs` executes, so it
cannot drift from what actually runs.

| Situation | Run |
| --- | --- |
| After each step of a task | `npm run verify unit` (~2s) |
| Touching a component | `npm run verify browser` (~24s) |
| Changed only docs or comments | `npm run verify static` (~4s) |
| **Before saying the work is done** | `npm run verify` (~70s) |

`npm run watch` is the human's terminal. Do not start it - it never exits.

## Rules

**"Done" means a full green `verify`.** The only exception is mechanical, not a judgement call:
if `git diff --name-only` touches nothing under `shared/`, `backend/`, `frontend/`, `scripts/` or
`e2e/`, then `npm run verify static` is enough. Never reason "this change could not possibly
affect Lighthouse" - a path rule cannot be talked into being wrong, and reasoning can.

**Paste the summary verbatim.** The row table and, on failure, the captured output. Not a
description of it.

**Never loosen a gate to make it pass.** Not a coverage threshold, not a skipped test, not an axe
rule exclusion, not `a11y.test: 'todo'`. If a gate is wrong, say so and let the human decide.
That is a conversation, not an edit.

**Fix bugs end to end first.** Reproduce with a failing story play or Playwright test before
touching the code, so the fix addresses the real cause rather than the first plausible one.

**Verify tool-reported state against the repo.** Session hooks, PR listings and status summaries
can describe a different remote than `origin`. Check before acting on them.

**Name semantic constants and derive shared contracts.** Executable calendar dates and
behavior-bearing numbers need meaningful `const` bindings; configured contracts must reference
their canonical exports. Follow [the semantic constants standard](docs/semantic-constants.md).

## Where things are

| Question | File |
| --- | --- |
| How a component talks to the model (events vs commands) | `docs/adr/007-ui-to-model-convention.md` |
| Why the test setup is shaped this way | `docs/adr/006-test-execution-model.md` |
| What each layer owns, Storybook authoring rules | `docs/adr/005-testing-and-storybook.md` |
| Domain language (Todo List, Todo, Next Due Date) | `CONTEXT.md` - glossary only, no implementation |
| Why the implementation makes its choices | `DECISIONS.md` |
| How literals and shared contracts are named and enforced | `docs/semantic-constants.md` |

`coverage-baseline.json` is a **lockfile, not a target**. It records the exact per-file tuples the
suite proves today and can only ratchet up through `npm run coverage:ratchet`. Do not edit or
recalibrate it to make a run pass.
