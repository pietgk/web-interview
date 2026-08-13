# ADR 009: Material UI 9.3 as the frontend UI platform

- Status: Accepted
- Date: 2026-08-10
- Scope: `@mui/material` / `@mui/icons-material` major line, React peer, Lighthouse JS budgets
- Supersedes: the MUI 5 + “React 18 because MUI 5 blocks React 19” constraint implied by
  [ADR 005](./005-testing-and-storybook.md)

## Decision

The frontend runs **Material UI 9.3** (Emotion styling, no Pigment) on **React 18**. We upgrade
before expanding OS accessibility-preference support so reduced-motion and forced-colors can use
MUI’s 9.1+ theme APIs (`motion.reducedMotion`, `enhanceHighContrast`) instead of a throwaway MUI 5
CSS layer that would be rewritten on the next major.

React 19 is deliberately **not** part of this move. Lighthouse script budgets were recalibrated to
**145 KiB** transfer / **65 KiB** unused after a failed reclaim chase; the previous 140 / 52 figures
were a MUI 5 baseline.

## Considered options

- **Stay on MUI 5 and hand-roll `@media` prefs** — ships prefs sooner, pays twice when upgrading.
- **Upgrade and adopt React 19 / Pigment in the same change** — larger blast radius; not required
  for the a11y APIs we need.
- **Kill the upgrade** — rejected: this app’s MUI surface is small and already on modern patterns
  (`ListItemButton`, no lab/Grid/`onBackdropClick`); verify stayed green after slot/`sx` migration.

## See also

- [`docs/plans/a11y-os-prefs-and-mui-platform.md`](../plans/a11y-os-prefs-and-mui-platform.md) —
  parked prefs program and spike findings
- [ADR 005](./005-testing-and-storybook.md) — Storybook / React testing seam
- [`scripts/run-lighthouse.ts`](../../scripts/run-lighthouse.ts) — JS budgets
- [`docs/adr/README.md`](./README.md)
