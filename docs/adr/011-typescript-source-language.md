# ADR 011: TypeScript as the source language

- Status: Accepted
- Date: 2026-08-13
- Scope: Source language, compiler strictness, and runtime type stripping

Product source, scripts, e2e, and workspace configs are TypeScript (`.ts` / `.tsx`), typechecked
at maximum strictness, and run by stock Node with native type stripping. Shared keeps its
declaration pipeline. The conversion translated existing JSDoc; it did not use the rename as a
type-repair pass.

## Considered options

- **Stay on JavaScript with JSDoc** — rejected: the driver is syntax ergonomics for a TypeScript
  developer, not a hunt for hidden defects.
- **Nub (or another type-stripping loader) for `node_modules`** — rejected: Node resolves the
  `shared` symlink to its realpath, so native stripping already applies.
- **Drop `shared`'s declaration pipeline** — considered, then reversed; `build:types` /
  `check-declarations` stay.
- **Maximum strictness in the same commit as each rename** — rejected: conversion was a
  translation; `noUncheckedIndexedAccess` and friends landed as a separate pass per workspace so
  coverage and runtime behavior could be checked independently.

`allowJs` / `checkJs` are off: no TypeScript project includes JavaScript. `eslint.config.js` and
the Vitest coverage reproductions under `docs/reproductions/` remain JavaScript on purpose and
are not in those projects. A no-new-`.js` ratchet for product source was deferred.

## See also

- [`docs/plans/typescript-migration-handoff.md`](../plans/typescript-migration-handoff.md) —
  conversion constraints and history
- [`docs/testing-and-validation.md`](../testing-and-validation.md) — typecheck as a static gate
- [`tsconfig.base.json`](../../tsconfig.base.json) — shared compiler options
- [`docs/adr/README.md`](./README.md)
