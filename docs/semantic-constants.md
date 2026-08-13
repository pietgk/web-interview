# Semantic constants

## Standard

Code should expose why a value matters, not merely what its primitive representation is. A reader
should see a heartbeat day, timeout, protocol width, or Todo text limit without reverse-engineering
the literal. When a value is a shared contract, every consumer must derive from the canonical
export so a contract change propagates through references.

The ESLint gate enforces two related rules:

- `semantic-constants/require-named-literal` checks exact executable ISO calendar dates and
  targeted behavior or representation numbers.
- `semantic-constants/require-canonical-contract` checks syntax mapped to shared contracts.

Both rules are errors. They deliberately have no auto-fix because choosing semantic meaning is a
design act.

## Decision tree

1. Is the value a configured shared contract?
   - Import and use the canonical export.
   - Convert its representation only at the boundary that requires it, such as `String(...)` for a
     DOM attribute assertion.
2. Is it an exact executable `YYYY-MM-DD` string?
   - Bind it directly to a descriptive `const` named for its scenario role.
3. Does a number control behavior, time, a protocol representation, or an external contract?
   - Bind the complete numeric expression to one descriptive `const`.
4. Does structural syntax already make the value evident?
   - Keep it literal when it is an index, a simple count, fixture data, *structural* style geometry
     such as `flexGrow: 1` or `gridColumn`, or a clear non-contract assertion outcome.
   - A **dimension** is not structural. `width: '11rem'` is a design decision nobody named; it
     belongs in `frontend/src/theme.js` as a token. See [design tokens](#design-tokens).
5. Does the meaning already have a higher-level abstraction?
   - Use that abstraction. Do not reconstruct it from lower-level constants or primitives.

## Examples

```js
const NEXT_DAY_ADVANCE_MS = 24 * 60 * 60 * 1_000
const expectedDayAfterHeartbeat = '2026-08-01'

server.advance(NEXT_DAY_ADVANCE_MS)
expect(client.getToday()).toBe(expectedDayAfterHeartbeat)
expect(notifications).toBe(2)
expect(events).toHaveLength(1)
```

The complete duration expression belongs to one name. Familiar unit arithmetic does not need
extra constants such as `MINUTES_PER_HOUR`.

```js
import { TODO_TEXT_MAX_LENGTH } from '@web-interview/todos/protocol'

await expect(field).toHaveAttribute(
  'maxlength',
  String(TODO_TEXT_MAX_LENGTH)
)
```

The following forms fail:

```js
server.advance(24 * 60 * 60 * 1_000)
expect(today).toBe('2026-08-01')
'0'.repeat(26)
const TODO_MAX_LENGTH = 1000
expect(response.status()).toBe(400)
```

Names must carry meaning. Generic laundering names such as `value`, `constant`, `number`,
`string`, `date`, and `testDate` fail. Module invariants normally use uppercase snake case. Local
test scenarios may use descriptive camel case.

## Ownership

Keep scenario constants local even when an unrelated scenario happens to use the same primitive.
Promote a constant to `shared` only when multiple consumers depend on one semantic invariant.
Organize shared constants with the module that owns the meaning, never in a collection grouped by
primitive type, unit, or value.

Use the highest-level available abstraction. `shared/src/ulid.js`, for example, owns
`ULID_LENGTH` and `EARLIEST_ULID`. A stale cursor scenario uses `EARLIEST_ULID`; it does not repeat
the encoded width or rebuild the value.

## Design tokens

The same standard, one layer down. A duration written as `86400000` hides why it matters; a width
written as `'11rem'` hides it in exactly the same way, and for longer, because nothing executes to
prove it wrong.

Every dimension the frontend chooses lives in `frontend/src/theme.js`, bound to a named `const`
with the reason, and is reached as `theme.todos.*`. The rule of thumb: **anything under
`theme.todos` is a decision we made; everything else is a decision MUI made for us.** Storybook's
*Foundations / Design tokens* page renders the namespace straight from the theme object, so the
documentation cannot drift from the values in use.

Enforcement is a `no-restricted-syntax` selector in `frontend/eslint.config.js`, not a rule in the
semantic-constants plugin: it needs no repository knowledge beyond "a px/rem/em literal on a
dimension property". Plain numbers on those properties stay legal, because MUI routes them through
`theme.spacing` and they are therefore already derived.

Some tokens mirror a value MUI owns but does not export - the height of an outlined input, the
alpha of its resting border, the white it lays over an elevated dark surface. A mirror drifts
silently, so each is covered by the `TodoItem` story **Controls share one height**, which measures
the real components and fails when MUI moves.

That guard works because it has two independent sources: one side is our constant, the other is
whatever MUI's own component computes, and an upgrade can pull them apart. **Apply that test before
writing any geometry assertion.** Measuring one element against another in the same layout pass
proves nothing - it restates what the browser just computed, so it verifies the browser rather than
the code, and it fails on any redesign that is merely different rather than wrong.

What the tokens buy visually is therefore *not* gated by a play function. `TodoListForm` pins
viewports through Storybook's built-in `globals.viewport` and leaves **Desktop** and **Small
mobile** as documented states to look at, each running its own axe pass. Pinning how they look is a
job for visual regression, which this repo does not have yet.

## Structural literals and exemptions

The numeric rule permits `-1`, `0`, and `1`, simple indexes, clear count assertions, structural
arrays and object data, and ordinary presentation geometry. Contract mappings remain
authoritative, so structural syntax cannot exempt `maxLength`, HTTP status, timeout, or another
configured sensitive use.

Central numeric exemptions are intentionally narrow:

- `scripts/generate-architecture-board.ts` is primarily drawing coordinates and dimensions.
- `scripts/eslint-plugin-semantic-constants.ts` is primarily AST grammar and rule metadata.

Exact executable dates and configured contracts remain enforced in exempted files. Do not add
inline disable comments or baseline suppressions. A new exemption must document why its numeric
syntax is already the clearest representation.

## Extending enforcement

Repository knowledge lives in `scripts/semantic-constants-config.ts`. The traversal in
`scripts/eslint-plugin-semantic-constants.ts` stays generic.

To add a semantic string category, sensitive numeric context, or canonical contract:

1. Add focused passing and failing cases to `scripts/semantic-constants.test.js`.
2. Extend the declarative patterns, contexts, contract definitions, or usage mappings.
3. For a syntax-dependent contract, map every unambiguous file and usage. Unmapped usage must fail
   as ambiguous instead of guessing.
4. Run the focused rule tests and prove a representative bad snippet fails through the real flat
   ESLint configuration.
5. Migrate every reported violation before merging. Do not introduce warnings or a baseline.

Add a new semantic-string category only after repeated repository evidence justifies it. Contract
configuration names canonical modules and exports, never today's copied primitive value.
