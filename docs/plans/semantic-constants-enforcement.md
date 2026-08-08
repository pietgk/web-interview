# Semantic constants enforcement handoff

## Status

The design is approved. The next session should implement it without reopening the resolved
product and policy decisions below. No implementation work has started.

This is an engineering standard, not Todo domain language. Do not add it to `CONTEXT.md`. It also
does not meet this repo's ADR threshold because the enforcement mechanism is straightforward to
reverse and introduces no architectural lock-in. Do not create an ADR.

## Goal

Make constants readable by meaning and make shared contracts drift-sensitive. A reader should not
have to infer why `26`, `'2026-07-31'`, or `'1000'` matters, and a contract change should propagate
through references instead of relying on an agent to find copied primitive values.

The policy must be deterministic enough to run as part of the existing ESLint gate. It should
combine mechanical enforcement with precise messages that steer authors and agents toward the
right abstraction.

## Motivating violations

### Leaked representation width

`e2e/todos.spec.js` and `backend/src/app.test.js` manufacture a stale transaction or cursor with:

```js
const staleTx = '0'.repeat(26)
```

The shared ULID module already owns the encoded representation through `TIME_LENGTH`,
`RANDOM_LENGTH`, its patterns, validators, and generators. Callers should not know how to
manufacture the earliest ULID.

### Unexplained calendar scenarios

`frontend/src/todos/todoClient.test.js` embeds dates whose relationship is apparent only after
doing calendar arithmetic:

```js
await waitUntil(() => client.getToday() === '2026-07-31')
expect(client.getToday()).toBe('2026-08-01')
```

The dates should be named for their role in the heartbeat and midnight scenario.

### Copied shared contract

Two Storybook assertions duplicate the Todo text limit:

```js
await expect(field).toHaveAttribute('maxlength', '1000')
```

Production already uses `TODO_TEXT_MAX_LENGTH`. The DOM assertion should derive its string
representation from the canonical export:

```js
await expect(field).toHaveAttribute(
  'maxlength',
  String(TODO_TEXT_MAX_LENGTH)
)
```

## Repository evidence

- ESLint 9 flat configuration is split across `eslint.config.mjs`,
  `frontend/eslint.config.js`, and `backend/eslint.config.js`.
- Lint already covers shared, backend, frontend, scripts, and E2E code in the static verification
  stage.
- ESLint's official `no-magic-numbers` rule covers numbers assigned to named constants, but it is
  frozen and does not cover semantic strings or repository contracts. See the
  [official rule documentation](https://eslint.org/docs/latest/rules/no-magic-numbers).
- ESLint flat config supports repository-local plugins and custom rules. See the
  [official custom rule documentation](https://eslint.org/docs/latest/extend/custom-rules).
- A strict trial of the stock numeric rule reported 507 existing violations across 59 files. A
  significant portion was structural data, drawing coordinates, indexes, counters, and explicit
  assertion outcomes. Do not enable the stock rule unchanged.
- There are 74 source lines containing executable-looking exact ISO calendar-date literals across
  15 files. Migrate all violations found by the final AST rule rather than maintaining a baseline.
- `shared/src/todoProtocol.js` already exports `TODO_TEXT_MAX_LENGTH` and
  `TODO_LIST_TITLE_MAX_LENGTH`.
- `shared/src/ulid.js` has `TIME_LENGTH = 10`, `RANDOM_LENGTH = 16`, and a duplicated regex width in
  `ULID_SOURCE = '[0-9A-HJKMNP-TV-Z]{26}'`.
- The working tree was clean before this handoff document was added.

## Approved policy

### 1. Use targeted, risk-tiered enforcement

Do not ban every primitive literal. Enforce the categories with concrete readability or drift
risk:

- executable ISO calendar-date literals;
- nontrivial numbers that encode behavior or representation;
- configured shared contract usages;
- reconstructed values for which a higher-level semantic constant already exists.

Allow literals whose meaning is supplied clearly by structural syntax and which do not represent a
configured contract.

### 2. Distinguish scenario literals from contracts

A scenario literal needs a meaningful local name. A contract value must derive from its canonical
export. Renaming a copied contract is still a violation:

```js
const TODO_MAX_LENGTH = 1000 // reject
```

Contract enforcement must point to the canonical module and export, never to today's primitive
value. If the contract changes from `1000`, the lint configuration must not need updating.

### 3. Require meaningful names

Targeted literals must be bound by `const` and use a category-bearing name. Examples include
`day`, `date`, `time`, `length`, `limit`, `timeout`, `interval`, and domain-specific equivalents.

Reject obvious laundering names such as `value`, `constant`, `number`, `string`, `date`, and
`testDate`. The rule cannot prove human-level semantics, but it must reject generic placeholders
and explain the intended naming standard.

Preserve current scope-sensitive style:

- module-level invariants use uppercase snake case;
- test-local scenario constants may use descriptive camel case;
- do not force every local test value into uppercase snake case.

Examples:

```js
const HEARTBEAT_START_DAY = '2026-07-31'
const expectedDayAfterHeartbeat = '2026-08-01'
```

### 4. Name the complete numeric expression

A descriptive constant owns the meaning of every ordinary numeric literal within its initializer:

```js
const NEXT_DAY_ADVANCE_MS = 24 * 60 * 60 * 1_000
const MAX_ULID_TIME = 2 ** 48 - 1
```

Do not require constants such as `MINUTES_PER_HOUR` merely to decompose familiar arithmetic. The
same expression remains a violation when used directly:

```js
server.advance(24 * 60 * 60 * 1_000)
```

A configured contract literal is still forbidden inside a newly named initializer.

### 5. Keep clear structural outcomes literal

Non-contract assertion outcomes may remain literal when the assertion subject makes the meaning
explicit:

```js
expect(notifications).toBe(2)
expect(client.events).toHaveLength(1)
expect(callback).toHaveBeenCalledTimes(2)
```

Also permit `-1`, `0`, `1`, simple array indexes, and similarly evident structural counts. This
permission is syntax-sensitive, not a blanket exemption for every assertion. Contract-specific
rules remain authoritative, so assertion syntax must not exempt `maxlength`, HTTP status
contracts, or another configured contract.

Reject values that encode behavior, time, protocol representation, or an unnamed external
contract:

```js
'0'.repeat(26)
server.advance(24 * 60 * 60 * 1_000)
expect(response.status()).toBe(400)
```

### 6. Enforce every executable ISO calendar date

Match exact string literal values in `YYYY-MM-DD` form. Require a descriptive constant in
production, unit tests, Storybook stories, and E2E code, including parameterized tables and nested
fixtures.

Ignore prose strings that merely mention a date as part of a longer explanation. Start with the
calendar-date category only. Add a new semantic-string pattern later only when concrete repeated
evidence justifies it.

Migrate all existing violations. Do not add a baseline suppression list.

### 7. Share meaning, not values

Keep scenario-specific constants local even when another file happens to use the same primitive.
Promote a constant to `shared` only when multiple consumers depend on the same semantic invariant.
Do not create a global constants collection organized by primitive type, value, or unit.

Prefer scenario names over unit-only names:

```js
const HEARTBEAT_ADVANCE_MS = 60 * 60 * 1_000
const NEXT_DAY_ADVANCE_MS = 24 * 60 * 60 * 1_000
```

### 8. Use the highest available semantic abstraction

Update `shared/src/ulid.js` along these lines:

```js
export const ULID_LENGTH = TIME_LENGTH + RANDOM_LENGTH
export const EARLIEST_ULID = '0'.repeat(ULID_LENGTH)
```

Derive `ULID_SOURCE` from `ULID_LENGTH`. Width consumers may use `ULID_LENGTH`, while stale
transaction and cursor scenarios must use `EARLIEST_ULID` rather than reconstructing it.

Use a contextual local alias when it improves a test:

```js
const staleTransaction = EARLIEST_ULID
const staleCursor = EARLIEST_ULID
```

### 9. Make contract enforcement syntax-aware

For maximum lengths:

- a `maxLength` property must reference a named value, never a literal;
- a `toHaveAttribute('maxlength', ...)` assertion must reference the configured canonical export
  and perform the string conversion at the DOM boundary;
- focused rule tests must reject substitution of the wrong constant when the expected contract can
  be determined;
- when syntax cannot determine whether a field uses the Todo title or Todo text contract, lint
  must report ambiguity instead of guessing.

A small semantic assertion helper or an explicit configuration mapping is acceptable when needed
to resolve ambiguity.

### 10. Keep rules generic and configuration declarative

Implement repository-local generic mechanisms, likely equivalent to:

- `require-named-literal`;
- `require-canonical-contract`.

Exact names may change if a clearer interface emerges. Repository knowledge belongs in declarative
ESLint configuration:

- ISO-date patterns;
- rejected generic names;
- allowed structural contexts;
- contract modules and export names;
- syntax usage mappings;
- narrow file exemptions.

Do not hard-code Todo constants, source paths, or today's values into AST traversal logic. A new
category or contract should normally require configuration and focused tests, not traversal edits.
If a usage is ambiguous and lacks a mapping, lint must fail with instructions to add one.

### 11. Use narrow central exemptions

Files whose primary purpose is numeric data or geometry may be exempted from the general numeric
rule through narrow, centrally documented ESLint configuration.

- Do not use inline disable comments.
- Do not exempt ISO dates or configured contracts merely because a file is data-heavy.
- Do not loosen a rule to make migration pass.
- Every exemption must state why the syntax is already the clearest representation.

### 12. Do not auto-fix initially

All violations are hard errors. Messages should name the missing semantic category or canonical
source and show the expected reasoning pattern.

Do not auto-fix semantic literals. Initially do not auto-fix contract references either. Add an
auto-fix later only when focused tests prove the transformation unambiguous.

## Expected rule examples

| Use | Result | Reason |
| --- | --- | --- |
| `const NEXT_DAY_ADVANCE_MS = 24 * 60 * 60 * 1_000` | allow | Descriptive binding owns the expression |
| `server.advance(24 * 60 * 60 * 1_000)` | reject | Inline behavior duration |
| `expect(today).toBe('2026-08-01')` | reject | Executable date lacks a descriptive binding |
| `expect(notifications).toBe(2)` | allow | Clear non-contract observation |
| `'0'.repeat(26)` | reject | Reconstructed representation |
| `String(TODO_TEXT_MAX_LENGTH)` in the mapped DOM assertion | allow | Canonical contract reference |
| `const TODO_MAX_LENGTH = 1000` | reject | Copied contract value |

## Implementation sequence

Roll out atomically. Do not introduce warnings, a grandfathered baseline, or a partial gate.

1. Add focused rule tests before enabling the rules.
   - The root scripts Vitest config currently includes only `scripts/*.test.mjs`, not nested test
     directories. Keep tests discoverable or deliberately update that configuration.
   - Cover passing and failing dates, composite numeric initializers, assertions, array indexes,
     contract references, wrong constants, ambiguity, generic names, prose, and exemptions.
2. Add the generic repository-local ESLint plugin.
3. Add shared declarative configuration that can be imported by all three flat configs.
4. Configure exact ISO calendar dates, numeric structural contexts, denied names, contract
   mappings, and the approved narrow data or geometry exemptions.
5. Enable the rules at error severity everywhere in scope.
6. Add `ULID_LENGTH` and `EARLIEST_ULID`, derive the ULID pattern width, and migrate stale cursor
   and transaction construction.
7. Migrate every executable ISO-date violation to a meaningful constant. Reuse a constant only
   when occurrences share scenario meaning, not merely the same string.
8. Replace the two Storybook `'1000'` assertions with canonical contract references and migrate
   any other contract violations reported by the rules.
9. Migrate nontrivial numeric violations reported by the final targeted rule. Do not mechanically
   name structural values the policy explicitly allows.
10. Add a concise mandatory rule and link in `AGENTS.md`.
11. Add `docs/semantic-constants.md` containing rationale, the decision tree, passing and failing
    examples, ownership rules, exemptions, and extension instructions.
12. Run verification and fix every failure without weakening a gate.

## Verification requirements

Follow the repository working agreement and Node 22 requirement:

```bash
mise exec node@22 -- npm run verify unit
mise exec node@22 -- npm run verify
```

Because implementation will touch `shared/`, `frontend/`, `backend/`, `scripts/`, or `e2e/`, a
full green `npm run verify` is mandatory before completion. Paste the verification summary
verbatim in the final handoff.

Also prove the lint rules directly with their focused unit tests and confirm that representative
bad snippets fail through the real ESLint configuration, not only through an isolated rule test.

## Documentation outcome

The final implementation should leave:

- a concise agent-facing rule in `AGENTS.md`;
- the complete standard in `docs/semantic-constants.md`;
- generic local rule implementation and focused tests;
- declarative ESLint configuration shared by the root, frontend, and backend configs;
- no changes to `CONTEXT.md`;
- no new ADR;
- no inline lint disables, baseline suppressions, warning phase, or auto-fixes.
