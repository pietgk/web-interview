# Design decisions

Entry map only. Prose lives in the linked docs.

| Topic | Doc |
| --- | --- |
| How the system works | [`docs/architecture.md`](./docs/architecture.md) |
| Accepted architectural decisions | [`docs/adr/README.md`](./docs/adr/README.md) |
| Protection model / verification pipeline | [`docs/testing-and-validation.md`](./docs/testing-and-validation.md) |
| Verify commands / stages | [`docs/verify.md`](./docs/verify.md) (`npm run verify help`) |
| Domain language | [`CONTEXT.md`](./CONTEXT.md) |

How to verify while working: [`AGENTS.md`](./AGENTS.md).

Accepted architecture decision records:

- [ADR 004: Single-datom log with last-write-wins projection](./docs/adr/004-single-datom-log.md)
- [ADR 005: Testing seams and Storybook](./docs/adr/005-testing-and-storybook.md)
- [ADR 006: How tests are run](./docs/adr/006-test-execution-model.md)
- [ADR 007: How the UI talks to the model](./docs/adr/007-ui-to-model-convention.md)
  ([checklist](./docs/conventions/ui-to-model.md))
- [ADR 008: Structured failures for datom delivery](./docs/adr/008-structured-datom-delivery-failures.md)

Superseded ADRs keep tombstones at the old paths; full text is under
[`docs/adr/archive/`](./docs/adr/archive/):
[001](./docs/adr/001-error-handling.md),
[002](./docs/adr/002-xstate-actors.md),
[003](./docs/adr/003-shared-datom-actor.md).
XState is no longer a dependency.
