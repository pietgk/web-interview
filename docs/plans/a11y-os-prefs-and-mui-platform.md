# OS accessibility prefs and MUI platform

## Status

**Slice 1 (motion + forced-colors): ready to land** on
`feat/os-a11y-prefs-motion-forced-colors` — theme wiring, Foundations story, Playwright smokes;
`npm run verify` green.

**Next session:** start a **new chat/context** from updated `master` after this PR merges. Do not
continue prefs design in the long grill thread. Handoff below.

This is an engineering / platform plan, not Todo domain language. Do not add it to `CONTEXT.md`.

## Next session handoff

Open a fresh agent session. Read this plan + [ADR 009](../adr/009-material-ui-9-platform.md). Do
**not** re-litigate parked grill decisions above unless requirements change.

### Already done (do not redo)

| Pref | Implementation | Proof |
| --- | --- | --- |
| `prefers-reduced-motion` | `theme.motion.reducedMotion: 'system'` in `frontend/src/theme.js` | `e2e/a11y-prefs.spec.js` (dialog `transitionDuration` 0s); Foundations story |
| `forced-colors` | `enhanceHighContrast(...)` on light/dark themes | same e2e (selected list `forcedColorAdjust: none`); Foundations story |

### Remaining v1 work (suggested order)

1. **`prefers-contrast: more`** — still hand-rolled (no MUI first-class API). Strengthen
   `theme.todos` borders / muted opacity / weak text under `@media (prefers-contrast: more)` for
   both light and dark. Proof: Storybook preference state + Playwright `emulateMedia({ contrast:
   'more' })` thin smoke.
2. **~200% zoom / rem smoke** — composed App/TodoLists still exposes primary controls at large
   page zoom (or root font scale). One Storybook or Playwright check.
3. **Storybook prefs toolbar spike** — thin **custom globals** for reduced-motion / contrast more /
   forced-colors (not `storybook-addon-css-user-preferences`). Kill if it fights `addon-themes` or
   Vitest browser. Ergonomics only; gates stay stories + Playwright.

### Out of this program

- Track **C** (screen reader / keyboard journey expansion)
- `prefers-reduced-transparency`, in-app OS-override toggles
- MUI / React upgrades (platform already on 9.3 + React 18)

### Suggested first prompt for the next session

> Continue OS a11y prefs from `docs/plans/a11y-os-prefs-and-mui-platform.md` — implement
> `prefers-contrast: more` next (hand-rolled theme tokens), with Storybook + Playwright proof per
> the parked plan. Do not reopen motion/forced-colors unless broken.

## Parked grill decisions (prefs program)

### Scope

- **In:** OS/browser media preferences + browser environment (zoom / root font size). Call this
  **A+B**.
- **Out for this program:** Assistive-tech / keyboard-only journeys as a dedicated track (**C**).
  Existing axe + landmarks stay; C is not expanded here.

### v1 preference set (ordered)

1. `prefers-reduced-motion`
2. `prefers-contrast: more` (with existing light/dark)
3. `forced-colors`
4. ~200% zoom / rem smoke on main composed views

Defer: `prefers-reduced-transparency`, in-app OS-override toggles.

### Proof strategy

- **Storybook:** pinned preference stories (or globals) on composed surfaces that change; axe where
  it still measures something useful.
- **Playwright:** thin `emulateMedia` smoke per pref (and zoom), not a full matrix.
- **Not:** Lighthouse prefs matrix.

### Storybook prefs menu

- Do **not** adopt `storybook-addon-css-user-preferences` (Storybook 6-era, abandoned, no
  `forced-colors`).
- **Do** include a time-boxed **custom globals toolbar** spike for the three media prefs; kill if
  it fights `addon-themes` or the Vitest browser runner.
- Gates remain preference stories + Playwright either way; the menu is ergonomics.

### Product response (blocked on platform)

Two candidate implementations — choose after the MUI verdict:

| Platform | Reduced motion | Forced colors | Contrast more |
| --- | --- | --- | --- |
| Stay MUI 5 | CSS `@media` in theme / CssBaseline | CSS system colors in `@media (forced-colors: active)` | Hand-rolled token overrides |
| MUI ≥ 9.1 | `theme.motion.reducedMotion: 'system'` | `enhanceHighContrast(theme)` | Still hand-rolled (no first-class API) |

Either way: keep today’s `prefers-color-scheme` via `useMediaQuery` + dual themes unless a later
CssVars migration is chosen separately.

## Investigation: MUI 5 → 9.1+ as a11y platform

### Why investigate before implementing prefs

MUI 5 → 9 is **three majors** (5→6→7→9; no 8). Dialog / focus / DOM a11y shifts land along that
path. Hand-rolling forced-colors and dialog motion on 5, then redoing after upgrade, is the
expensive order. Target APIs for a clean prefs layer are **`motion.reducedMotion` and
`enhanceHighContrast`**, both **≥ 9.1.0** (current latest at investigation time: **9.3.1**).

### Kill criteria (from the grill)

| Question | Kill if… |
| --- | --- |
| Reach 9.1+ with green `verify` without rewriting the todo model? | Model / datom work required |
| Story/axe/e2e break surface from Dialog/List/Alert? | Amounts to rewriting the story catalog |
| Do 9.1 APIs cover enough of v1 prefs that custom CSS is residual? | Barely (upgrade doesn’t buy cleanliness) |
| Must React 19 or Pigment come along? | Forced — prefer React 18 + Emotion for this move |

### Facts from this repo

**MUI surface is small and already modern:**

- Components in use: `Box`, `Card`, `TextField`, `Checkbox`/`FormControl`/`InputLabel`, `IconButton`,
  `List`/`ListItem`/`ListItemButton`/`ListItemIcon`/`ListItemText`, `Typography`, `Alert`,
  `Dialog` (+ title/content/actions), `Button`, `ThemeProvider`, `CssBaseline`, `useMediaQuery`,
  `createTheme`, `alpha`/`lighten`, `@mui/icons-material`.
- Already on `ListItemButton` (not deprecated `ListItem button`).
- No `Grid` / `Grid2`, no `@mui/lab`, no `Hidden`, no `createMuiTheme`, no `onBackdropClick`, no
  deep `styles/createTheme` imports.
- Custom tokens live under `theme.todos` (`frontend/src/theme.js`) — should survive majors if
  module augmentation (`themeTokens.d.ts`) is updated for new theme types.

**Known fragile spots after any MUI bump:**

- `CompletionField` mirrors outlined-input geometry; `TodoItem` story **Controls share one height**
  fails when MUI moves.
- Storybook axe `color-contrast` carve-out for `.MuiOutlinedInput-input`.
- `StatusBar` Alert action layout (documented MUI quirks in statusbar plan).

**Stack constraints:**

- ADR 005: Storybook on **React 18** because **MUI 5** blocked React 19 — not an eternal ban.
- MUI **9.3.1** peers: React **17 \| 18 \| 19**; Emotion optional; **Pigment optional**. React 18 +
  Emotion can stay. From v6+, pin `react-is` to the React 18 line via npm `overrides`.

### What 9.1+ buys vs what it does not

| v1 pref | Bought by MUI ≥ 9.1? |
| --- | --- |
| `prefers-reduced-motion` | **Yes** — `theme.motion.reducedMotion: 'system'` (Dialog transitions included) |
| `forced-colors` | **Mostly** — `enhanceHighContrast(theme)` for MUI components; app-owned chrome may still need a little CSS |
| `prefers-contrast: more` | **No** — still hand-rolled tokens/CSS |
| ~200% zoom | **No** — layout/smoke only |

Plus: incidental component a11y/keyboard/DOM fixes across v6–v9 (worth having before raising the
prefs bar).

### Effort shape (estimate, not a schedule)

1. Stage upgrades with codemods: 5→6 → 7 → 9.1+ (or install 9.3.x and walk breaking-change guides).
2. `react-is` override; keep React 18; do not adopt Pigment in this move.
3. Fix CompletionField / Alert / Dialog story fallout; re-check axe carve-out.
4. Only then resume prefs implementation on 9.1 APIs + residual contrast/zoom work.

Rough read: **medium platform PR (or stacked PRs), not a rewrite** — inventory is small and already
post-ListItemButton. Biggest unknown is story/axe churn, not application architecture.

### Investigation verdict (recommendation)

**Do not kill. Stage the upgrade before implementing prefs.**

- **Go** on targeting **MUI ≥ 9.1** (prefer current 9.3.x) as the prefs platform, **React 18 +
  Emotion**, no Pigment, no React 19 in the same move.
- **Accept** that `prefers-contrast: more` remains custom either way — upgrade is still worth it for
  motion + forced-colors + cleaner component a11y baseline.
- **Kill only if** a first install/codemod spike shows catalog-level story rewrite or forces Pigment /
  React 19.

### Spike result (`spike/mui-9.3-a11y-platform`, 2026-08-10)

Branch installs `@mui/material` / `@mui/icons-material` **9.3.1**, pins `react-is@18.3.1` via
`overrides`, keeps React 18 + Emotion (no Pigment).

**Breaks fixed on the spike (mechanical, not catalog rewrite):**

| Issue | Fix |
| --- | --- |
| `TextField` `inputProps` / `InputLabelProps` removed | `slotProps.htmlInput` / `slotProps.inputLabel` (codemod) |
| `Checkbox` `inputProps` removed | `slotProps.input` (codemod) |
| System props on `Typography` / `Box` (`fontWeight`, `color`) | move into `sx` (codemod) |

**Kill criteria:** none tripped. Storybook play/axe and e2e stayed green; no todo-model rewrite;
no Pigment/React 19 forced.

**`npm run verify` summary (verbatim):**

```
  typecheck  PASS     1.5s
  lint       PASS     1.8s
  diagrams   PASS     0.0s
  audit      PASS     2.2s
  unit       PASS     1.7s
  storybook  PASS    14.4s
  e2e        PASS    17.3s
  build      PASS     1.6s
  lighthouse FAIL    33.0s
  coverage   PASS     0.6s   96.27% stmt · 94.26% branch · 97.93% func

  RED · 1 of 10 failed
```

Lighthouse categories (Perf/A11y/BP/SEO/Agentic) all **100**. Only **JS budgets** failed:

- Initial transfer **141.0 KiB** vs budget **140.0 KiB**
- Estimated unused **63.6 KiB** vs budget **52.0 KiB**

That is a real cost of the major bump, not a prefs bug. **Do not loosen budgets in the spike** —
human decides whether to chase unused JS, accept a budget update through the normal process, or
stage the upgrade behind that conversation.

**Spike verdict:** **GO** on MUI 9.3.x as the prefs platform, contingent on resolving the Lighthouse
JS budget conversation. Resume prefs implementation (motion / `enhanceHighContrast` / contrast more
/ zoom / toolbar spike) after that lands green.

### Budget chase (option C)

Attempted reclaim before raising the gate:

| Attempt | Result |
| --- | --- |
| Bundle analysis (`rollup-plugin-visualizer`) | Main cost is `@mui/material` (~111 KiB gzip of graph) + `react-dom` + app; `zod` ~20 KiB gzip but required for `apiErrorBodySchema` on the client and was already in the MUI 5 bundle |
| Vite `experimental.optimizePackageImports` for MUI | **No** size change (still 461 / 143.89 KiB gzip main) |
| Dropping TextField / Dialog surface | Would change product UX — out of scope for a budget chase |

**Decision:** raise budgets to **145 KiB** transfer and **65 KiB** unused in
`scripts/run-lighthouse.mjs`, documented as the MUI 9.3 baseline with tight headroom. Not a silent
loosen — explicit recalibration after a failed reclaim.

## Resume checklist (after platform decision)

1. Confirm go/kill on MUI 9.1+ (ADR if go — technology lock-in + sequencing surprise).
2. Resume prefs grill only for residual decisions (contrast token strategy, toolbar spike details).
3. Implement prefs + preference stories + Playwright smokes + optional globals toolbar.
4. Keep track **C** (SR / keyboard journeys) as a separate later program.
