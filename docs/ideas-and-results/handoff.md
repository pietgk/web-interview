# Handoff — Ideas and Results

WIP vocabulary from a `/grill-with-docs` session on branch `idea-to-spec`. Glossary: [`CONTEXT.md`](./CONTEXT.md). Map: [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md).

**This is not a skill.** It is a vocabulary layer, the same slot as `/domain-modeling` and `/codebase-design`. Do not edit `ask-matt` or install old-coder until the mapping below is done.

## Next session is for

Integrate this language with the existing skill landscape so the picture improves, then fit [old-coder](https://github.com/AmazingAng/old-coder) as how we develop together (you read SPEC + EVIDENCE, not the code).

## Suggested skills

- `/grill-with-docs` — map skills onto these terms; grill **Implementation** vs **Renders** without stealing codebase-design’s **Implementation**
- `/ask-matt` — the landscape this vocabulary must join
- `/codebase-design` — Module / Interface / Implementation / Depth / Seam (do not copy into the Ideas and Results glossary)
- `/prototype`, `/to-spec`, `/implement`, `/tdd` — the overlaps to classify as constructive or conflicting
- `/handoff` if this session fills up before the mapping is done

## Locked path

1. An **Idea** shows up (any size; nested), at any stage of work.
2. **Clarify**: **Talk** if prose is faithful; **Ask** if the answer must be bound to a **Live Drawing**; **Try** if it must be driven or compared. **Show** is the register. **Medium** is offstage.
3. A **Result** exists (pointable; human and agent). It may still live only in the thread.
4. If it must outlive the thread: **Keep** it as a **Hold** or a **Record**. **Promote** an existing Result to a Record.
5. Architecture Drawings speak codebase-design. Spec is one kind of Record and may contain Drawings.

Talk, Hold, and Record are working names. **Job** was dropped.

## Explicit non-goals of that grill (still open)

- Mapping `/prototype`, `/grill-with-docs`, whiteboard scripts, Lavish, show-me, `/teach`, `/to-spec`, `/implement` onto Clarify / Keep / Promote / Medium
- Naming **Implementation** and **Renders** (“Idea Implementation Renders”) — parked because **Implementation** already means the body of a Module (codebase-design) and `/implement` is the build skill
- Installing or wiring [old-coder](https://github.com/AmazingAng/old-coder)
- Editing `ask-matt` or adding a new skill
- An ADR (vocabulary is still WIP)

## First questions for the next grill

1. For each existing skill/script: is the overlap **constructive** (the skill *is* Talk / Ask / Try / Keep / Promote / a Medium) or **conflicting** (two names for one purpose)?
2. What does **Renders** mean that **Drawing** does not? If nothing, drop it.
3. What word do we use for “building the thing” so it does not collide with codebase-design **Implementation** or `/implement`?
4. Does old-coder sit on `/implement` as the gauntlet (approve SPEC, read EVIDENCE), or does it replace `/tdd` / `/code-review`?

## Starting overlap (unconfirmed)

| Skill / script | Candidate term | Guess |
| --- | --- | --- |
| `/grill-with-docs` | Talk (Grill = procedure) | constructive |
| `/prototype` | Try | constructive if the skill *is* Try |
| `npm run whiteboard` | Medium for Keep | constructive |
| Lavish / show-me | Medium + Show + Live Ask | conflict if installed as extra Clarifies |
| `/to-spec` | Promote to a spec Record | constructive |
| `/implement` + `/tdd` | after a Record | not a Clarify |
| old-coder | trust layer on `/implement` | not a Clarify |
