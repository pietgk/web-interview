# Implementation plan: ADR and docs restructure

Status: Implemented (all three phases).

Agreed in a grilling session. This document is the handoff — do not re-litigate the taxonomy
unless a concrete conflict with the repo appears. Implement in the three phases below; stop after
each phase with links updated and `npm run verify static` green (docs-only work).

Before editing, read:

- this plan
- `.agents/skills/domain-modeling/ADR-FORMAT.md` (via `.claude/skills/...` symlink — edit once)
- current `DECISIONS.md`, `docs/adr/004`–`008`, `docs/testing-and-validation.md`
- `README.md` and `AGENTS.md` “where things are” / “why it is built this way”

## Objective

Make architectural decisions findable again:

1. **ADRs** are short decision records (trade-off + why), not essays.
2. **`docs/architecture.md`** is the living “how the system works” narrative.
3. **Reference docs** hold inventories and command encyclopedias that are not decisions.
4. **`DECISIONS.md`** remains at the repo root as a permanent stub/map only.
5. **Superseded ADR bodies** live under `docs/adr/archive/` with tombstones at the old paths.

No production code changes are required for this plan. Do not loosen verify gates. Do not invent
new architectural choices while rewriting.

## Target taxonomy

| Kind | Home | Contains |
| --- | --- | --- |
| Decision (accepted) | `docs/adr/004`–`008` (thin) | What we chose, why, what we forbid, links out |
| System narrative | `docs/architecture.md` | Datom log, journal, SSE/POST, client, ids, lifecycle, settle, StatusBar, design non-goals / deferred constraints |
| Protection model | `docs/testing-and-validation.md` | Why/when checks exist (already canonical; trim later if needed, do not dump 006 into it) |
| Verify reference | new short doc (see Phase 3) | Command/stage reference + pointer to `npm run verify help` |
| UI↔model reference | `docs/conventions/ui-to-model.md` (if still useful) | Interaction table / module map not required in the ADR |
| Entry map | `DECISIONS.md` (stub) | Links only — no architecture prose |
| ADR index + local rules | `docs/adr/README.md` | Accepted list, superseded list, link to format |
| Superseded history | `docs/adr/archive/` | Full text of 001–003 |
| Tombstones | `docs/adr/001`–`003` at old paths | ~5–15 lines: superseded by, link to archive |
| Interview “what we built” pitch | `README.md` | Scope completed / deliberate interview surfaces |

Keep existing numbering style (`001-slug.md`, not `0001-`). Do not renumber.

## Edit rule for ADRs (pragmatic amend)

- **Same architectural choice, bad write-up** → edit/thin in place; move prose to docs or archive.
- **Choice itself changes** → new ADR that supersedes; do not silently rewrite history.
- Typos and link fixes are always OK.

## ADR shape (repo add-on to the skill)

Base format remains ADR-FORMAT.md (1–3 sentence core; optional alternatives/consequences).

This repo **also requires** on every accepted ADR:

- Status
- Date
- Supersedes / Superseded by (when applicable)
- Scope (one line)
- **See also** — links to the living docs that hold narrative/reference material moved out of the ADR

Forbidden in the ADR body: code dumps, full interaction inventories, verify stage encyclopedias,
migration plans, long “how we got here” narratives (one short paragraph of context is enough).

Soft rule: if a reader must scroll to find the decision, the ADR is too long.

---

## Phase 1 — Stop the bleeding (convention only)

Goal: future ADRs cannot regrow into essays; humans have an index.

### Do

1. Update `.agents/skills/domain-modeling/ADR-FORMAT.md`:
   - Keep the minimal template and “when to offer” gates.
   - Add a **“This repository”** section documenting: Status/Date/Scope/Supersedes, required
     **See also**, pragmatic-amend rule, pointer to `docs/adr/README.md`, and the rule that
     narrative/reference material belongs under `docs/` not in the ADR.
   - Note that this repo numbers as `NNN-slug.md` (three digits), matching existing files.

2. Create `docs/adr/README.md`:
   - One-line purpose of ADRs vs `docs/architecture.md` vs other docs.
   - Link to ADR-FORMAT.md (path: `../../.agents/skills/domain-modeling/ADR-FORMAT.md` or a
     short relative path that works from the repo — prefer linking in a way README/AGENTS already
     use; if awkward, say “see `.agents/skills/domain-modeling/ADR-FORMAT.md`”).
   - **Accepted** table: 004, 005, 006, 007, 008 with one-line decision each (write from current
     content; refine in Phase 3 when thinning).
   - **Superseded** table: 001 → 008, 002 → 003 → 004 (point at current paths until Phase 2 moves
     them).
   - Explicit: do not add new ADRs that duplicate `docs/architecture.md`.

3. Optionally add a single row to `AGENTS.md` “Where things are” pointing at `docs/adr/README.md`.
   Do **not** yet replace the DECISIONS.md row (Phase 2).

### Do not

- Move or thin ADR bodies yet.
- Create `docs/architecture.md` yet.
- Touch `DECISIONS.md` prose yet.

### Done when

- Skill + `docs/adr/README.md` describe the same rules.
- `npm run verify static` passes.
- A new reader can see which ADRs are accepted without opening each file.

---

## Phase 2 — Narrative home + archive superseded ADRs

Goal: one living architecture doc; superseded essays out of the primary ADR folder; root stub map.

### Do

1. Create `docs/architecture.md` by **splitting** current `DECISIONS.md` + overlapping narrative
   from ADR 004 (and only the system-narrative bits of other docs if needed):
   - Persistence / datom / journal
   - API (SSE down, POST up), epoch/cursor behavior
   - Last-write-wins / no conflict path
   - Shared runtime contract (`DatomStore`, schema)
   - Browser read model / outbox / offline non-goals
   - Entity ids and ordering
   - Todo List lifecycle / defining attributes / navigation order hypothesis
   - Completed list derived
   - Edit granularity (settle)
   - Ghost composer
   - StatusBar as projection
   - Due-date formatting (if still accurate)
   - **Knowingly deferred / design non-goals** that constrain the architecture
   - Link to thin ADR 004 / 008 for the decisions; do not paste testing pipeline here

2. Move interview framing out of DECISIONS into **README** (“Scope completed” / deliberate
   interview discussion surfaces). Keep README concise — bullets, not a second architecture doc.

3. Replace `DECISIONS.md` with a **permanent stub** (~10–20 lines), for example:
   - Architecture → `docs/architecture.md`
   - Decisions → `docs/adr/README.md`
   - Testing → `docs/testing-and-validation.md` (+ later verify reference)
   - Domain language → `CONTEXT.md`
   - No duplicated prose.

4. Archive ADR 001–003:
   - Create `docs/adr/archive/`.
   - Move full files to `docs/adr/archive/001-error-handling.md` (etc.), preserving names.
   - Leave **tombstone files** at the original paths: status superseded, successor link, link to
     `./archive/00x-….md`, one sentence on what survived if useful (003 already has this tone).
   - Update `docs/adr/README.md` superseded section to link archive + tombstones.
   - Update relative links inside archived files only if they break; prefer minimal churn.

5. Thin **ADR 004** now (it overlaps architecture heaviest):
   - Keep the decision: single-datom log, LWW, no conflict/rebase/rejection path, byte-identical
     datoms, defining attributes / one-datom deletes — as a short card.
   - Move protocol/journal/id tables into `docs/architecture.md` (or ensure they already landed
     there from DECISIONS — dedupe, don’t maintain two copies).
   - Add **See also** → `docs/architecture.md`, stub DECISIONS, related ADRs.

6. Update pointers:
   - `README.md` “Why it is built this way” table/list
   - `AGENTS.md` “Where things are”
   - Any in-repo links that assumed DECISIONS.md held prose
   - Historical plans under `docs/plans/` may keep old wording; update only if they claim
     DECISIONS.md is still the living design doc for new work

### Do not

- Thin 005–008 yet (Phase 3), except link fixes.
- Merge large new sections into `docs/testing-and-validation.md`.
- Delete git history reliance as the only archive (full text must be in `archive/`).

### Done when

- `DECISIONS.md` has no architecture body.
- `docs/architecture.md` is the readable system story.
- 001–003 full text is only under `archive/` (+ tombstones at old paths).
- ADR 004 is a short decision card with **See also**.
- `npm run verify static` passes.

---

## Phase 3 — Thin remaining ADRs + extract reference docs

Goal: 005–008 match the card shape; bulky leftovers have homes; inventories that tests already
enforce can be deleted rather than relocated.

### ADR 005 — Testing seams and Storybook

**Keep as decision:** seam-based coverage (not global JSX %); layer ownership; Storybook owns
component states/play/a11y; React version constraint if still true.

**Move or delete:** anything superseded by 006 about gates that “never existed”; point to 006 and
`docs/testing-and-validation.md`.

### ADR 006 — How tests are run

**Keep as decision:** two tiers (`watch` / `verify`); no middle tier; coverage collected in unit /
browser and judged in quality; exact attributable ratchet / baseline-as-lockfile; Node 22 asserted;
proof must not vanish quietly (high level).

**Extract** command/stage encyclopedia to a **new short reference doc**, suggested name:
`docs/verify.md` (or `docs/verify-commands.md` if you want clearer distinction from the npm
script). It should:

- Point at `npm run verify help` as the non-drifting command list
- Summarize tiers/stages/policy without duplicating the entire current ADR
- Be linked from ADR 006 **See also**, `AGENTS.md`, and the DECISIONS stub

**Do not** dump this into `docs/testing-and-validation.md` (already marked WIP / too long). At most
add a “See also” link from that file to the new verify reference.

### ADR 007 — UI talks to the model

**Keep as decision:** three owners (domain facts / screen state / in-flight text); after an
interaction, classify by what changed; only `todoListCommands` knows datoms; one settle timer
mechanism.

**Extract** to `docs/conventions/ui-to-model.md` only what is still useful as a human checklist
(interaction table, module map). **Delete** parallel tables already enforced by tests or that
merely snapshot one moment in the code — do not maintain a second source of truth.

Update `AGENTS.md` to point at thin ADR 007 + convention doc as needed.

### ADR 008 — Structured datom delivery failures

Already close to the target shape. Ensure Status/Date/Scope/Supersedes/**See also** are present;
link `docs/architecture.md` (StatusBar / failure visibility) and tombstone/archive for 001. Trim
only if something is pure narrative duplication.

### README / index polish

- `docs/adr/README.md`: refresh one-line summaries after thinning.
- README architecture decision list: accepted cards primary; superseded called out as archive /
  tombstones.
- Ensure interview scope bullets live in README, not in architecture.

### Done when

- Accepted ADRs 004–008 are scannable cards (decision above the fold).
- `docs/verify.md` (or chosen name) and optional `docs/conventions/ui-to-model.md` exist as needed.
- No accepted ADR still contains a wall-of-text inventory or verify encyclopedia.
- Links in README, AGENTS, DECISIONS stub, adr README, and See also lines are consistent.
- `npm run verify static` passes.

---

## Link and pointer checklist (all phases)

Update as each phase lands:

| Location | Expectation |
| --- | --- |
| `README.md` | Stub DECISIONS meaning; architecture doc; ADR index; interview scope; archived 002/003 |
| `AGENTS.md` | Where things are → architecture, adr README, thin ADRs, testing doc, verify ref |
| `DECISIONS.md` | Stub map only |
| `docs/adr/README.md` | Accepted + superseded + format pointer |
| `docs/testing-and-validation.md` | Link verify ref; do not absorb 006 encyclopedia |
| `docs/plans/*` | Only if they instruct agents to update DECISIONS.md as living design prose |
| Cross-links inside ADRs | Tombstones, archive paths, See also |

## Out of scope

- Renumbering ADRs to `0001` style
- Rewriting `docs/testing-and-validation.md` in full (optional later trim; not blocking)
- Changing verify scripts, coverage baseline, or tests
- New architectural decisions
- Deleting superseded history from git (archive folder is enough)

## Verification

Docs-only: after each phase,

```bash
mise exec node@22 -- npm run verify static
```

If a phase accidentally touches `shared/`, `backend/`, `frontend/`, `scripts/`, or `e2e/`, run full
`npm run verify` instead.

Paste the verify summary verbatim in the session notes.

## Suggested commit strategy (only if the human asks for commits)

Prefer one commit per phase, e.g.:

1. `docs: add ADR index and format add-on`
2. `docs: add architecture.md, stub DECISIONS, archive ADRs 001-003`
3. `docs: thin ADRs 005-008 and extract reference docs`

Do not commit unless explicitly asked.

## Success criteria (whole effort)

A human can answer “what architectural decisions did we make?” from `docs/adr/README.md` plus the
five short accepted ADRs in minutes, and can learn “how the system works” from
`docs/architecture.md` without reading ADR archaeology. Agents load the same rules from
ADR-FORMAT.md and the ADR README.
