# ADR 005: Testing seams and Storybook

- Status: Accepted, superseded in part by [ADR 006](./006-test-execution-model.md)
- Date: 2026-08-04
- Scope: Coverage policy, test-layer ownership, Storybook, React version

> **Superseded in part.** The coverage gate described below never existed in the code, and the
> a11y flip to `'error'` had not happened. ADR 006 records what is actually gated, at what
> numbers, and when each check runs. Layer ownership and the Storybook authoring rules here still
> stand.

## Context

The repo already exercises behavior in several places: shared-domain Vitest tests, backend
API/journal tests, React Testing Library component tests, `createFakeDatomServer` for in-memory
datom I/O, and Playwright e2e against a real Vite + backend stack. We want Storybook for
isolated component development and component tests (CSF, play functions, a11y, Vitest addon),
without overlapping jobs or chasing a global 100% line-coverage gate. Latest Storybook works on
React 18 with our Vite 6 / Vitest 3 stack; React 19 is optional and blocked in practice by MUI 5
peer ranges.

## Decision

### Coverage is seam-based, not global 100%

CI gates **near-100%** coverage on:

- `shared` (datom store, schema, selectors, ids)
- frontend non-UI logic (`todoModel`, `todoListsUiState`, client/protocol helpers)
- `fakeDatomServer`
- backend journal and API

Components are judged by **story states, play functions, and a11y**, not by a hard line-% on JSX.
Coverage reports still help find untested seams; they are not a vanity percentage across the
whole tree.

### Who tests what (no permanent overlap)

| Layer | Owns | Does not own |
| --- | --- | --- |
| **Unit (Vitest)** | Pure logic and the fake server itself | React trees, browser journeys |
| **Storybook play (Vitest addon, browser)** | Component states, interaction, a11y; composed UI including `App` against `fakeDatomServer` | Real journal, multi-process wiring |
| **Playwright e2e** | Process boundaries: real server + journal, multi-tab/reconnect/persistence, thin smoke, non-UI API contracts | Re-clicking every control already covered by play |

When a story’s `play` covers a component’s states/interactions/a11y, the matching RTL
`*.test.jsx` is removed after a short dual-run while Storybook CI is trusted. The mocked-children
`App.test.jsx` goes away once App stories exist. Vitest may keep rare non-story runtime carve-outs
only when a failure mode is awkward to assert through the UI.

### Storybook stack and authoring

- Install **Storybook 10** with `@storybook/react-vite`, `@storybook/addon-vitest`, and
  `@storybook/addon-a11y` on **React 18** (no React 19 / MUI 6 as part of this work).
- Stories use **CSF 3** (not experimental CSF Next).
- Every repo-owned UI component gets stories, including `App`.
- Story catalog = **user-visible domain states** the component is responsible for (empty,
  populated, completed, due/overdue, StatusBar connection/delivery/recovery, etc.). No prop
  matrices and no invented loading/error states the UI does not have.
- Put interaction/`play` on the **lowest** component that owns the behavior; parent plays cover
  composition only (wiring, focus handoffs, StatusBar + lists together).
- A11y: enable the addon with `parameters.a11y.test: 'todo'` at preview, then flip to `'error'`
  when the inventory is green. `play` still covers keyboard, focus, and accessible names axe
  cannot prove alone.

### What backs composed stories

Composed stories and any remaining Vitest runtime tests use **`createFakeDatomServer`** — the
same in-memory datom backend already used in frontend tests. Do **not** add MSW as a second fake.
Do **not** run the real journal inside Storybook; that stays Playwright-only.

## Consequences

- Component development and most UI regression proof move into Storybook; `npm test` gains a
  Storybook/Vitest browser project alongside existing unit projects.
- E2e suite should shrink toward process-boundary and smoke coverage as stories land.
- React 19 remains a separate migration (with MUI), not a Storybook prerequisite.
