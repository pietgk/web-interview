# Coverage evidence treatment audit

Date: 2026-08-12

This audit reviewed every discovered production source through its implementation, production
consumers, tests or stories, and natural observable interface. The executable result is the
explicit registry in [`scripts/source-evidence-registry.mjs`](../scripts/source-evidence-registry.mjs):
every entry names one treatment and carries the per-file rationale reviewed here. Filesystem rules
only discover source; they do not assign treatment.

Both exact-coverage producers use the pinned Istanbul provider. Their evidence manifests and the
generated baseline record provider name, package, and resolved version independently at the root
and frontend install boundaries.

## Accepted treatment rules

| Treatment | Required producer | Verdict |
| --- | --- | --- |
| `node-runtime` | Node Vitest | Exact per-file owner baseline |
| `storybook-controller` | Storybook Chromium | Exact per-file owner baseline |
| `rendered-ui` | Storybook Chromium | Story discovery, execution, play assertions, and axe; percentage informational |
| `playwright-bootstrap` | Playwright | Assembled-system journey; no exact tuple |
| `test-support-node` | Node Vitest | Explicit accounting as test support |
| `test-support-storybook` | Storybook Chromium | Explicit accounting as test support |
| `type-only` | TypeScript | Typecheck; no runtime tuple |

The registry is the complete file-by-file audit record. Its validation fails for a missing,
duplicate, stale, unknown, or rationale-free entry, so this document cannot become a competing
inventory.

## Ambiguous modules resolved

| Module | Reviewed treatment | Evidence and reasoning |
| --- | --- | --- |
| `useGhostComposer.js` | `storybook-controller` | React state is its public interface. `TodoListForm` stories exercise materialization, retitling, deletion, visibility, and commit behavior through the mounted consumer. |
| `useSettledText.js` | `storybook-controller` | Its contract depends on React state, effects, cleanup, timers, and incoming-prop adoption. `TodoItem`, `TodoListTitleField`, and composed stories observe those behaviors in Chromium. |
| `useTodoLists.js` | `storybook-controller` | Its interface is React external-store subscription plus mount/unmount ownership of one client. App and composed Todo Lists stories exercise that lifecycle. The legacy cleanup call is classified separately. |
| `focusLeft.js` | `rendered-ui` | It is a two-line DOM containment predicate with one production consumer. Its meaningful behavior is focus leaving the rendered composer row, already asserted through browser interaction. It does not earn an exact standalone seam. |
| `legacyReplica.js` | `playwright-bootstrap` | It is a browser-storage startup side effect, not deterministic runtime policy or rendered UI. Repository history shows it was introduced on 2026-08-03 when IndexedDB persistence was removed. No deployment workflow or record establishes use beyond developer browser profiles. |
| `fakeDatomServer.js` | `node-runtime` | It has a direct injected in-memory transport contract and a Node test. Storybook execution is useful overlap but cannot own or rescue its exact verdict. |
| `todoClient.js` | `node-runtime` | It coordinates injected transport, optimistic state, outbox delivery, rehydration, and stream lifecycle through an interface tested directly in Node. Storybook exercises it incidentally through the application. Map compatibility is checked rather than assumed. |
| `trustedClock.js` | `node-runtime` | It localizes trusted server-time adoption, half-round-trip adjustment, calendar scheduling, subscriptions, identifier minting, and cleanup behind an injected-clock interface tested directly in Node. |

## Separate findings, not coverage classification

`legacyReplica.js` is retained unchanged by this migration. The repository cannot establish
whether old IndexedDB profiles still exist outside developer machines. Its current effect runs on
every application mount, which is idempotent but is not literally the historical plan's "one-time
on boot" wording. Storybook currently executes the cleanup incidentally and neither suppresses nor
asserts it. If the migration remains a product requirement, add an assembled-browser journey in a
separate end-to-end-first change; if it does not, remove the module through a separately reviewed
file-set and product change. Coverage ownership does not decide that outcome.

No production cleanup or redesign was performed as part of this audit.

## See also

- [ADR 010: Producer-owned coverage evidence](./adr/010-producer-owned-coverage-evidence.md)
- [Testing and validation](./testing-and-validation.md)
- [Implementation plan](./plans/producer-owned-coverage-evidence.md)
