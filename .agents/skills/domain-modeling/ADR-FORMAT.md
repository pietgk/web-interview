# ADR Format

ADRs live in `docs/adr/` and use sequential numbering: `0001-slug.md`, `0002-slug.md`, etc.

Create the `docs/adr/` directory lazily — only when the first ADR is needed.

## Template

```md
# {Short title of the decision}

{1-3 sentences: what's the context, what did we decide, and why.}
```

That's it. An ADR can be a single paragraph. The value is in recording *that* a decision was made and *why* — not in filling out sections.

## Optional sections

Only include these when they add genuine value. Most ADRs won't need them.

- **Status** frontmatter (`proposed | accepted | deprecated | superseded by ADR-NNNN`) — useful when decisions are revisited
- **Considered Options** — only when the rejected alternatives are worth remembering
- **Consequences** — only when non-obvious downstream effects need to be called out

## Numbering

Scan `docs/adr/` for the highest existing number and increment by one.

## When to offer an ADR

All three of these must be true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will look at the code and wonder "why on earth did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

If a decision is easy to reverse, skip it — you'll just reverse it. If it's not surprising, nobody will wonder why. If there was no real alternative, there's nothing to record beyond "we did the obvious thing."

### What qualifies

- **Architectural shape.** "We're using a monorepo." "The write model is event-sourced, the read model is projected into Postgres."
- **Integration patterns between contexts.** "Ordering and Billing communicate via domain events, not synchronous HTTP."
- **Technology choices that carry lock-in.** Database, message bus, auth provider, deployment target. Not every library — just the ones that would take a quarter to swap out.
- **Boundary and scope decisions.** "Customer data is owned by the Customer context; other contexts reference it by ID only." The explicit no-s are as valuable as the yes-s.
- **Deliberate deviations from the obvious path.** "We're using manual SQL instead of an ORM because X." Anything where a reasonable reader would assume the opposite. These stop the next engineer from "fixing" something that was deliberate.
- **Constraints not visible in the code.** "We can't use AWS because of compliance requirements." "Response times must be under 200ms because of the partner API contract."
- **Rejected alternatives when the rejection is non-obvious.** If you considered GraphQL and picked REST for subtle reasons, record it — otherwise someone will suggest GraphQL again in six months.

## This repository

This repo numbers ADRs as `NNN-slug.md` (three digits), matching the existing files — not
`0001-slug.md`. Index and local rules: [`docs/adr/README.md`](../../../docs/adr/README.md).

### Required on every accepted ADR

- **Status** — `Accepted`, or superseded with a link to the successor
- **Date**
- **Scope** — one line
- **Supersedes** / **Superseded by** — when applicable
- **See also** — links to the living docs that hold narrative or reference material moved out of
  the ADR (`docs/architecture.md`, convention docs, testing docs, etc.)

Keep the 1–3 sentence core from the template above. Optional Considered Options / Consequences
still apply when they add value.

### What does not belong in an ADR

Narrative “how the system works,” inventories, command encyclopedias, migration plans, and long
“how we got here” histories live under `docs/` (or archive), not in the ADR body. One short
paragraph of context is enough. Soft rule: if a reader must scroll to find the decision, the ADR
is too long.

Do not add an ADR that duplicates `docs/architecture.md`.

### Pragmatic amend

- **Same architectural choice, bad write-up** → edit or thin in place; move prose to docs or
  `docs/adr/archive/`.
- **Choice itself changes** → write a new ADR that supersedes; do not silently rewrite history.
- Typos and link fixes are always OK.
