# ADR 005: Testing seams and Storybook

- Status: Accepted (superseded in part by [ADR 006](./006-test-execution-model.md))
- Date: 2026-08-04
- Scope: Coverage policy shape, test-layer ownership, Storybook authoring, React version
- Superseded in part by: [ADR 006](./006-test-execution-model.md) (what is gated, at which numbers,
  when each check runs)

## Decision

Coverage is **seam-based**, not a global JSX % gate. Logic seams (shared, frontend non-UI,
fake server, backend journal/API) are judged by coverage; components are judged by **story
states, play functions, and a11y**.

Layers do not permanently overlap:

| Layer | Owns |
| --- | --- |
| Unit (Vitest / Node) | Pure logic and the fake server |
| Storybook play (browser) | Component states, interaction, a11y; composed UI against `createFakeDatomServer` |
| Playwright e2e | Process boundaries: real server + journal, multi-tab/reconnect/persistence, thin smoke |

Storybook runs on **React 18** (we stay on 18 with Material UI 9.3 — see
[ADR 009](./009-material-ui-9-platform.md); React 19 is a separate decision). Stories
use CSF 3; catalog = user-visible domain states; put `play` on the lowest owner of the behavior;
do not add MSW as a second fake or run the real journal inside Storybook.

Early write-ups of near-100% thresholds and an a11y flip that had not landed are historical —
[ADR 006](./006-test-execution-model.md) is authoritative for gates.

## See also

- [ADR 006](./006-test-execution-model.md) — how tests are run and what is gated
- [ADR 010](./010-producer-owned-coverage-evidence.md) - which producer can satisfy an exact coverage verdict
- [`docs/testing-and-validation.md`](../testing-and-validation.md) — protection model
- [`docs/verify.md`](../verify.md) — command / stage reference
- [`docs/adr/README.md`](./README.md)
