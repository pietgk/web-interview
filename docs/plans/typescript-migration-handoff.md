# TypeScript migration handoff

Converting the whole repository from JavaScript-with-JSDoc to TypeScript
(`.ts` / `.tsx`). Branch: `typescript-migration-prerequisites`, cut from `master`
at `48232d1`.

This document is written for someone - or some model - arriving with no prior
context. Read the constraints section before writing code. Several of them were
established empirically after an incorrect first guess, and re-deriving them
costs more than reading them.

## Status at handoff

Three commits landed and green. A fourth workspace conversion is **in progress
and uncommitted**.

| | |
| --- | --- |
| Committed | `a5caa42`, `f669614`, `218b298` - all with a full green `verify` |
| In progress | `scripts/` conversion, **typecheck red at 303 errors** |
| Working tree | 50 files staged, 1 unstaged (`scripts/coverage-producers.ts`) |
| Clean revert point | `218b298` |

The in-progress work is **not committed**, by the repository owner's explicit
request to review before committing. If you are picking this up cold, commit it
as work in progress first so it cannot be lost - a red-typecheck tree is fine on
a feature branch, and losing two-thirds of a mechanical conversion is not.

## Why

The owner is a TypeScript developer and does not want to work in JSDoc. That is
the whole driver. It is **not** a correctness project.

An earlier version of this plan claimed the conversion would surface ~67 hidden
type defects. **That claim was wrong** and has been retracted. See "Corrections
already made" below, and do not re-introduce it as a justification.

## Constraints proven by experiment

Each of these was verified by running it, not by reasoning. Do not re-litigate.

### TypeScript ignores JSDoc types in `.ts` files

The single most important fact. Identical file content:

```
a.js   clean
a.ts   error TS7006: Parameter 'n' implicitly has an 'any' type.
```

Renaming a file destroys every type its JSDoc provided. This is why a "rename
only, no semantic change" phase is **impossible**, and why error counts track
JSDoc density rather than sloppiness.

### `checkJs` was not weak

The pre-existing JSDoc types were real and enforced. The migration is a
*translation*, not a repair. Preserve the declared types verbatim; do not
"improve" them in the same pass.

### Node needs the literal on-disk specifier

| Written | File on disk | Result |
| --- | --- | --- |
| `'./y.js'` | `y.ts` | `ERR_MODULE_NOT_FOUND` |
| `'./y'` | `y.ts` | `ERR_MODULE_NOT_FOUND` |
| `'./y.ts'` | `y.ts` | works |

So relative imports must be rewritten to `.ts` as part of any rename. Files that
have *not* been converted yet keep their `.js` specifiers.

### `import type` is mandatory, and its absence is invisible

Type stripping is per-file, so an unmarked type import survives erasure:

```
import { Foo, bar } from './t.ts'
         ^^^
SyntaxError: The requested module './t.ts' does not provide an export named 'Foo'
```

This passes typecheck **and** lint and fails only at runtime.
`verbatimModuleSyntax` is on and `@typescript-eslint/consistent-type-imports` is
an error, which together prevent it. Do not weaken either.

### Node strips types through the `shared` symlink

`node_modules/@web-interview/todos` is a symlink to `shared/`. Node resolves it
to its realpath, which is outside `node_modules`, so type stripping works.
There is **no** blocker to `shared/src` becoming `.ts` while still shipping
source. (An early claim that this was blocked was tested wrong and retracted.)

### TypeScript 7 ships no JS compiler API

`typescript@7.0.2` exposes `version` and nothing else - `createProgram`,
`createSourceFile`, `SyntaxKind`, `sys` are all `undefined`. typescript-eslint
therefore **refuses to load at all** under TS 7, not merely for type-aware rules:

```
typescript-eslint does not support TS 7.0.
```

No release channel supports it (`latest`, `canary`, and `typescript-estree` all
cap at `<6.1.0`), and there is no timeline - upstream is blocked on ESLint not
supporting async parsers.

The repository uses Microsoft's documented side-by-side layout:

```json
"@typescript/native": "npm:typescript@^7.0.2",
"typescript": "npm:@typescript/typescript6@^6.0.2"
```

`tsc` is TypeScript 7 and runs the typecheck gate. The `typescript` specifier
resolves to the TS 6 API, used **only as a parser** for lint. TypeScript 7
remains the sole authority on whether code typechecks. Applied in both the root
and `shared`. `frontend/node_modules/typescript@6.0.3` is transitive and benign.

### Lint goes silently green on renamed files

The trap that motivated most of the prerequisite work. Identical code:

```
probe.js   2 errors
probe.ts   warning: File ignored because no matching configuration was supplied
EXIT=0
```

Renaming without widening lint globs takes every custom rule offline - the ADR
007 datom guards, the themed-dimension rule, `require-named-literal` - while
`verify` stays green. The `lint-scope` gate now makes that a failure. **Never
narrow it.**

## Decisions already made

Settled with the owner. Treat as given; if one needs revisiting, ask rather than
quietly changing it.

| Decision | Choice |
| --- | --- |
| Driver | Syntax ergonomics only |
| Scope | Everything: product source, `scripts/`, `e2e/`, config files |
| Runtime | Stock Node with native type stripping. **Nub was evaluated and rejected** - it is v0.7 and solves a problem this repo does not have |
| `shared` package | **Keeps** its declaration pipeline (`build:types`, `check-declarations`, `dist/types`, `type-tests`). Owner reversed an earlier decision to delete it |
| Lint | One root config, one typescript-eslint, **syntax-only** |
| Strictness | Maximum, but as a **separate phase 3 per workspace**, not during conversion |
| Module extensions | One per language. `.mjs`/`.cjs`/`.mts`/`.cts` are banned and `lint-scope` enforces it |
| Order | `scripts/` → `e2e` + configs → `shared` → `backend` → `frontend` |
| Docs | New ADR 011 + living docs. `docs/plans/` and `docs/research/` stay as history |
| Delivery | One PR per area, each fully green |
| Review | **Show the owner the diff and wait before committing** |

Phase model per workspace, revised once the pure-rename phase proved impossible:

1. Rename + translate JSDoc to TS syntax (one commit)
2. Maximum-strictness flags for that workspace (separate commit)

## What has landed

**`a5caa42` prepare lint for TypeScript sources** - side-by-side TypeScript
alias; three ESLint configs consolidated into one root config; eslint removed
from `backend/` and `frontend/`; `lint-scope` gate added; lint now runs over `.`
so scope cannot be missed by an argument list. Brought 10 previously unlinted
files into scope, surfacing one real finding (a hook in a Storybook decorator,
given a justified disable).

**`f669614` make the root package ESM and drop redundant extensions** - root
`"type": "module"`; all 38 scripts, the e2e helper and root configs renamed
`.mjs` → `.js`.

**`218b298` enforce one extension per language** - `.mjs`/`.cjs`/`.mts`/`.cts`
removed from globs and made a `lint-scope` failure.

## In progress: `scripts/`

36 files renamed `.js` → `.ts`, git detects all 36 as renames. Errors went
**525 → 303**, with **19 of 36 files fully clean**.

Clean already - do not revisit:

```
check-declarations  check-diagrams  check-diagrams.test  check-lint-scope
commandResolution  commandResolution.test  coverage-artifacts
coverage-artifacts.test  coverage-producer-cli  e2e-ui  semantic-constants-config
source-evidence-registry  stages  start-dev-api  testing-documentation.test
verify  vitest.config  watch  whiteboard
```

Remaining, by file:

```
60  coverage-evidence.ts             25  coverage-evidence.test.ts
57  generate-architecture-board.ts   20  semantic-constants.test.ts
35  eslint-plugin-semantic-constants 15  coverage-producers.test.ts
29  coverage-producers.ts            11  source-evidence.ts
                                     11  coverage-evidence-cli.ts
        + ~40 across 7 smaller files
```

Lint is also red, and only in the expected class. `eslint .` reports exactly
**21 `@typescript-eslint/no-explicit-any`** and **2
`@typescript-eslint/consistent-type-imports`**, across `coverage-evidence-cli`,
`coverage-evidence`, `coverage-producers`, `demo`,
`eslint-plugin-semantic-constants`, `generate-architecture-board`,
`lighthouse-report` and `source-evidence.test`. Nothing else in the repository
lints dirty.

The owner chose "real type, or a disable with a written justification" for
`no-explicit-any`. Suggested split: real types for coverage blobs, justified
disables for genuine ESLint AST escape hatches. The two
`consistent-type-imports` are autofixable with `eslint --fix`.

### The codemod

`docs/plans/typescript-migration-codemod.py` - throwaway tooling, **delete it
when the migration completes**. It converted ~120 sites automatically:

```bash
python3 docs/plans/typescript-migration-codemod.py $(git ls-files 'shared/src/*.ts')
```

It is deliberately conservative and refuses shapes it cannot prove it
understands - multi-parameter destructuring, defaults, rest args - because `tsc`
catches an omission but not a wrong type that still typechecks. Those refusals
are the hand-translation work.

It handles, in three passes: `@param`/`@returns` into signatures; `@typedef`
into `type` aliases; `@type` declarations and inline `/** @type {T} */ (x)` casts
into annotations and `as`. Prose comments survive.

**Verify its output.** It cut `sumCoverage` in `coverage-producers.ts` by
dropping an opening paren and leaving its closer.

## Traps

**A syntax error hides everything else.** When `tsc` reports one error, check
whether it is `TS1005`/`TS1128`/`TS1109` before celebrating. A syntax error
suppresses semantic errors project-wide, so the count drops to near-zero while
hundreds remain. This happened during the `scripts/` work.

**`semantic-constants-config.ts` hardcodes extensions** in its contract
mappings - `/Todo(?:Composer|Item)(?:\.stories)?\.jsx$`,
`/TodoListTitleField(?:\.stories)?\.jsx$`,
`exceptFilePattern: '/shared/src/todoProtocol\.js$'`. These silently stop
matching when those files become `.tsx`/`.ts`. **Make them extension-agnostic in
the `shared` and `frontend` phases.** This is a live, known, unfixed gate loss.

**`coverage-baseline.json` and `source-evidence-registry.ts` key every path by
extension**, including `registryDigest`. `scripts/` and `e2e/` are *not* in
either, which is why `scripts/` went first. `shared`, `backend` and `frontend`
all are. Regenerate only via `npm run coverage:update-baseline`; never hand-edit.
Coverage should be unchanged by conversion, since type annotations are erased -
**if a coverage number moves, stop and find out why** rather than re-baselining.

**`shared` needs a declaration diff.** Before renaming `shared/src`, capture
`shared/dist/types`; regenerate after and diff. It was verified that TS 7 emits
`import type { Attr } from './datom.ts'` into `.d.ts` and consumers resolve it
correctly to the sibling `.d.ts`, with types genuinely flowing (a wrong value is
rejected, under `skipLibCheck` both true and false). Declarations generated from
JSDoc and from TS may differ in form; review the diff rather than gating on
byte-equality.

**`zsh` does not word-split unquoted `$VAR`.** `for f in $FILES` passes one giant
argument. Use `git ls-files -z ... | xargs -0`.

**Run Node through mise.** `mise exec node@22 -- npm run verify`. The repo pins
Node 22 and `verify` refuses to run on another major.

## Remaining work

1. **Finish `scripts/`** - 303 errors, then the `any` cleanup, then full green
   `verify`. Show the owner the diff before committing.
2. **`e2e/` + config files** - cheapest area. Playwright runs `.ts` natively.
   `playwright.config.js`, `vitest.config.js`, `frontend/vite.config.js`,
   `frontend/.storybook/*`, the workspace vitest configs.
3. **`shared/`** - capture declarations first. Update `tsconfig.types.json`
   globs and `package.json` `files` + per-export `default` to `.ts`; `types`
   stays pointing at `dist/types`.
4. **`backend/`** - straightforward; consumes `shared`.
5. **`frontend/`** - largest. `.jsx` → `.tsx`. Storybook globs already accept
   `ts|tsx`. Heaviest coverage-baseline surface.
6. **Phase 3 per workspace** - maximum strictness
   (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
   `noPropertyAccessFromIndexSignature`, `noImplicitOverride`,
   `noImplicitReturns`).
7. **Cleanup** - remove `allowJs`/`checkJs` from `tsconfig.base.json` once no JS
   remains; rename `jsconfig.json` files to `tsconfig.json`; add the no-new-`.js`
   ratchet (deferred, needs a recorded list of converted areas since current
   state cannot detect a regression); delete the codemod; write **ADR 011** and
   update living docs.

Forced compiler options are already set in `tsconfig.base.json`:
`allowImportingTsExtensions`, `erasableSyntaxOnly`, `verbatimModuleSyntax`.

## Commands

```bash
mise exec node@22 -- npx tsc -p jsconfig.json     # scripts/e2e/root errors
mise exec node@22 -- npm run typecheck            # every project
mise exec node@22 -- npm run verify static        # ~4s
mise exec node@22 -- npm run verify               # ~4m, the definition of done
mise exec node@22 -- node scripts/check-lint-scope.ts
```

## Definition of done

A full green `verify`, and the owner has seen the diff. Never loosen a gate to
get there - not a coverage threshold, not a skipped test, not an axe rule. If a
gate is wrong, that is a conversation with the owner, not an edit.

## Corrections already made

Recorded so they are not repeated:

- **"`shared` cannot ship `.ts` because Node refuses type stripping in
  `node_modules`"** - wrong. Tested with a real directory instead of the symlink
  the repo actually uses. Node resolves the symlink to its realpath.
- **"`checkJs` is materially weaker than `.ts`, and the conversion surfaces ~67
  hidden type defects"** - wrong. The errors are JSDoc going inert, not defects.
  The example cited was a JSDoc-declared optional parameter (`gatedPaths?`,
  `sourceEvidence?`) that the call sites correctly omitted.
