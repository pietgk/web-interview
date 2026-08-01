# Review of the initial Grok 4.5 implementation

## Purpose and status

This document reviews commit `399e6738101494acc797209820bccff834546736`, the initial
Grok 4.5 implementation of the Sellpy web interview assignment, and records the
approved follow-up implementation.

The implementation completes the main task and all four optional tasks:

- Persist todo lists on the server
- Autosave changes
- Mark individual todos as completed
- Derive whether a list is completed
- Add due dates and show remaining or overdue time

**Status:** The findings below were approved and implemented. See
[Final green proof](#final-green-proof) for verification evidence.

## Executive assessment

The submission is a good first version. It separates the Express application, router, and
store; introduces stable todo IDs; derives list completion instead of storing duplicate state;
and adds unit, integration, and end-to-end coverage. The existing lint, build, unit, integration,
and Playwright suites pass.

The main concern is that the happy-path tests do not exercise the failure modes created by
debounced asynchronous persistence. A user can lose an edit by switching lists before the
debounce expires, and overlapping requests can apply stale responses. Those data-loss paths
affect the core autosave requirement, so they are P1 issues. A failed save also has no recovery
path; that and the remaining consistency and validation findings are P2 issues.

The P2 issues concern state consistency, runtime validation, due-date semantics, and missing
regression coverage. They do not invalidate the whole design, but fixing them will make the
implementation much easier to explain and defend in a senior engineering interview.

## The engineering story

The improvement work should follow a visible red-green-refactor sequence:

1. Establish that the current test suite is green.
2. Reproduce a reported problem through the UI as a user would experience it.
3. Add the smallest automated regression test that captures that behavior.
4. Run the focused test and record its failure. This is the red proof.
5. Implement the smallest robust design change that addresses the cause rather than the symptom.
6. Run the focused test again and record its success. This is the green proof.
7. Run the complete unit, integration, end-to-end, lint, and build checks.
8. Refactor only while the full suite remains green.

This sequence matters because a passing pre-existing suite does not prove that a newly discovered
failure mode is covered. The new test must fail against the original implementation, otherwise it
cannot prove that the fix changes the behavior we intended to change.

## Evidence collected during this review

### Baseline evidence

The unmodified Grok implementation passes its existing checks:

```text
Backend:   9 tests passed
Frontend: 10 tests passed
E2E:       3 tests passed
Lint:      passed
Build:     passed
```

This baseline is useful, but it also demonstrates the coverage gap: the current suite is green
while the data-loss behavior below is still present.

### Manual end-to-end reproduction of lost edits

The autosave problem was reproduced through the running application:

1. Open `First List`.
2. Change its todo text to `Unsaved switch test`.
3. Before the AUTOSAVE_DEBOUNCE_MS ms debounce expires, open `Second List`.
4. Wait longer than AUTOSAVE_DEBOUNCE_MS ms.
5. Return to `First List`.

Expected:

```text
The edited text remains visible and is eventually persisted.
```

Actual:

```text
The text returns to "First todo of first list!".
No save request is sent for the discarded edit.
```

This is an end-user reproduction of the P1 data-loss issue. The debounce timer is cancelled when
the keyed form unmounts, and the draft exists only inside that form.

### Automated red proof against the current implementation

Focused regression tests were run from a temporary review harness so that the repository remained
unchanged. These tests are proposals for the permanent regression suite after this document is
approved.

```text
FAIL review regressions against Grok implementation

✕ flushes an edited todo when the form unmounts before the debounce expires
  Expected saveTodoList to have been called with the edited todo
  Number of calls: 0

✕ does not describe a completed todo as overdue
  Expected no overdue message
  Found: "1 day overdue"

Tests: 2 failed, 2 total
```

The backend validation regressions also fail against the current store:

```text
✕ rejects an impossible calendar date
  Expected result.ok: false
  Actual result.ok:   true

✕ rejects duplicate todo ids
  Expected result.ok: false
  Actual result.ok:   true

Tests: 2 failed, 2 total
```

These failures are the current red proof. Green proof is intentionally not present yet because no
fix has been approved or implemented. During implementation, the exact passing output must be
added to this document or the resulting pull request before the work is considered complete.

## Findings

### P1-1: Switching lists can silently discard edits

Relevant code:

- `frontend/src/todos/useDebouncedValue.js`
- `frontend/src/todos/components/TodoListForm.jsx`
- `frontend/src/todos/components/TodoLists.jsx`

`TodoListForm` owns the only copy of the current draft. `useDebouncedValue` schedules persistence
after AUTOSAVE_DEBOUNCE_MS ms and correctly clears its timer on unmount. `TodoLists` gives the form a key based on
the active list, so selecting another list unmounts the old form. If the user switches during the
debounce window, clearing the timer also removes the only scheduled save, and unmounting removes
the only copy of the draft.

Why this matters:

- It is silent data loss in the main autosave workflow.
- Normal navigation inside the application is enough to trigger it.
- Refreshing or closing the page during the debounce window creates a similar risk.
- Showing an autosave UI creates a reasonable expectation that edits will not disappear merely
  because the user opens another list.

Planned test coverage:

- A Playwright test that edits the first list and immediately selects the second list, then returns
  and verifies the draft and persisted value.
- A component test using fake timers that changes a todo, unmounts before AUTOSAVE_DEBOUNCE_MS ms, and proves the
  change is not discarded.
- A refresh test that defines the expected behavior while a dirty draft exists.

Planned design:

- Move per-list draft ownership above the keyed form, preferably into a reducer or focused
  `useTodoLists` model keyed by list ID.
- Make `TodoListForm` controlled: it renders a supplied draft and reports edits upward.
- Keep pending drafts alive when the visible form changes.
- Save immediately on list change or allow a background per-list save queue to finish.
- Save on blur where useful, while retaining the debounce for normal typing.
- Warn before page exit if an acknowledged save cannot be guaranteed. A `pagehide` or keepalive
  request may be considered, but it must not replace durable dirty-state handling.

Why this design:

The debounce should control network frequency, not the lifetime of user data. Keeping the draft in
a longer-lived owner separates those responsibilities and removes the unmount data-loss path.

### P1-2: Overlapping saves can apply stale data

Relevant code:

- `frontend/src/todos/components/TodoListForm.jsx`
- `frontend/src/todos/components/TodoLists.jsx`
- `frontend/src/api/todoLists.js`

Every debounced value starts an independent `PUT`. The effect cleanup marks an old effect as
cancelled, but it does not cancel or serialize its request. In addition, the parent-level
`saveTodoList` callback updates `todoLists` for every resolved response. The cancellation flag in
the form does not protect that parent update.

If an older request resolves after a newer request, the older response can replace newer parent
state. Ignoring only the old UI status update is insufficient. Aborting a request also needs care,
because the server may already have applied it even if the client stops waiting for the response.

Why this matters:

- This is another data-loss path inside a single browser session.
- It can be triggered by ordinary latency, not only by multiple users or multiple tabs.
- A whole-list `PUT` magnifies the effect because the stale request replaces the complete todo
  collection.

Planned test coverage:

- Use controlled promises for two saves of the same list.
- Resolve the newer save first and the older save second.
- Verify that the final draft, acknowledged state, completion indicator, and server state all
  represent the newer edit.
- Add a Playwright or integration scenario with delayed responses if it can remain deterministic.

Planned design:

- Use one serialized save queue per list.
- Allow at most one request per list to be in flight.
- While a request is in flight, retain and coalesce edits into the newest pending draft.
- When the request completes, save the newest pending draft if it differs from the acknowledged
  version.
- Associate each draft and acknowledgement with a monotonically increasing local revision so a
  stale response can never overwrite newer client state.
- If later requirements introduce multiple clients, add server-side versions or ETags. That is
  separate from the same-client sequencing required here.

Why this design:

Serialization provides stronger correctness than simply aborting requests. It preserves ordering
at both the server and client while still coalescing rapid edits into a small number of requests.

### P2-1: Failed saves have no recovery path

Relevant code:

- `frontend/src/todos/components/TodoListForm.jsx`

The UI displays `Save failed`, but the unchanged debounced value will not trigger the effect again.
The edit remains visible locally with no reliable way to persist it. The user must make another
change, and refreshing loses the draft.

Why this matters:

- Reporting an error is only part of error handling.
- A recoverable network interruption becomes permanent until the user discovers an undocumented
  workaround.
- The application does not clearly distinguish dirty, saving, saved, and failed-but-still-dirty
  data.

Planned test coverage:

- Reject a save and verify that the draft remains present and marked dirty.
- Verify that a Retry action is available and accessible.
- Resolve the retry and verify the transition from error to saving to saved.
- Verify that an edit made after a failure saves the latest complete draft, not the failed draft.

Planned design:

- Model persistence status explicitly: `clean`, `dirty`, `saving`, and `error`.
- Retain failed drafts in the same per-list state owner.
- Provide an explicit Retry action.
- Retry automatically when a later edit occurs and optionally when the browser reports that the
  connection is online again.
- Keep the error message actionable and do not claim that all changes are saved until the latest
  revision is acknowledged.

### P2-2: Parent state and form state can disagree

Relevant code:

- `frontend/src/todos/components/TodoListForm.jsx`
- `frontend/src/todos/components/TodoLists.jsx`

The form stores optimistic todos locally, while `TodoLists` stores the last successful server
response. The list-completed indicator is derived from the parent copy. Checking the final todo
therefore updates the form immediately but leaves the list indicator unchanged until the server
responds. If the save fails, the two visible representations disagree indefinitely.

Why this matters:

- It weakens the stated single-source-of-truth design.
- Users receive conflicting feedback about whether the list is complete.
- It contributes directly to the unmount data-loss issue.

Planned tests:

- Mark the last todo complete while the save is intentionally pending.
- Verify that the list indicator updates immediately from the draft.
- Reject the request and verify that the completed draft remains visible but is marked unsaved.
- Retry successfully and verify that the acknowledgement does not replace newer edits.

Planned design:

Use one per-list draft model as the source for all visible UI. Keep the last acknowledged server
revision as metadata for persistence and conflict handling, not as a second competing render model.

### P2-3: Runtime validation accepts invalid todo records

Relevant code:

- `backend/src/store.js`
- `frontend/src/api/todoLists.js`

The handwritten predicate checks only broad JavaScript types. It accepts impossible dates, empty
IDs, duplicate IDs, and additional properties. The frontend also trusts API responses without
runtime validation.

Concrete failures proven during review:

- `dueDate: "2026-02-31"` is accepted.
- Two todos with `id: "t1"` are accepted.
- Duplicate IDs later become duplicate React keys, breaking stable component identity.

Planned Zod contract:

- Todo IDs must be non-empty strings.
- IDs must be unique within a todo list.
- Text remains a string. Empty text should remain allowed because adding a todo creates an empty
  editable item, but a reasonable maximum length should be considered.
- `completed` must be a boolean.
- `dueDate` must be `null` or a strict `YYYY-MM-DD` calendar date that round-trips without date
  normalization.
- Objects should be strict so unknown properties are rejected or explicitly stripped by policy.
- Update request bodies and API responses should be parsed at their boundaries.
- Validation errors should use a stable JSON shape suitable for display and testing.

Preferred structure:

Create a small shared contract package used by both backend and frontend so the shape is defined
once. Before committing to that structure, verify that the existing Create React App build can
consume the package without custom bundler work. If that creates disproportionate build coupling,
keep the backend schema authoritative and use contract tests or generated client schemas rather
than manually maintaining two subtly different schemas.

Why Zod:

Static types alone cannot validate HTTP input or persisted JSON. Zod makes the accepted runtime
contract executable, testable, and reusable. It also replaces a growing set of handwritten checks
with one schema whose errors can be handled consistently.

### P2-4: Completed todos are still described as overdue

Relevant code:

- `frontend/src/todos/components/TodoItem.jsx`
- `frontend/src/todos/todoModel.js`

Due status is calculated without considering completion. A completed todo with a past date still
renders `1 day overdue`. That is confusing because an item that is already done is no longer
waiting to be completed.

Planned tests:

- An incomplete past-due todo is overdue.
- A completed past-due todo is not described as currently overdue.
- Today, one-day, plural-day, invalid-date, and daylight-saving boundaries remain deterministic.

Planned design:

Make the display rule explicit. The recommended behavior is to preserve the due date but replace
remaining or overdue status with `Completed` once the todo is done. If the product later needs to
say whether it was completed late, add a `completedAt` timestamp; that cannot be inferred from the
current boolean.

### P2-5: Regression coverage is concentrated on happy paths

Relevant code:

- `frontend/src/todos/components/TodoListForm.test.jsx`
- `frontend/src/todos/components/TodoItem.test.jsx`
- `backend/src/store.test.js`
- `backend/src/app.test.js`
- `e2e/todos.spec.js`

The existing tests are useful, but they prove only successful, ordered, low-latency behavior. The
most important missing coverage is the behavior around the debounce and asynchronous mutation
lifecycle.

Additional improvements to the tests:

- Assert the exact text patch emitted by `TodoItem`, not merely that `onChange` was called.
- Test due-date changes as an interaction, not only due-date rendering.
- Check that the Playwright reset request succeeds before each test.
- Verify completed and due-date persistence after a refresh.
- Use table-driven cases for date formatting and schema validation.
- Use controlled promises for request ordering rather than real timing in unit tests.
- Keep the number of end-to-end cases small, but make each one prove a complete user story.

## Test and implementation plan

The work should proceed in the following order after approval.

### Phase 1: Add permanent red regressions

Add focused tests for:

1. Edit followed immediately by list switching.
2. Form unmount before debounce expiry.
3. Two saves resolving out of order.
4. Failed save followed by explicit retry.
5. Optimistic list-completion feedback while saving.
6. Completed todo with a past due date.
7. Invalid calendar dates.
8. Duplicate todo IDs.
9. Runtime validation of API responses.

Run each new test against commit `399e673` and preserve concise failure output. Do not weaken an
assertion merely to make it pass.

### Phase 2: Establish one client-side draft model

- Lift drafts out of `TodoListForm`.
- Use a reducer or dedicated hook with state keyed by list ID.
- Make the form controlled.
- Derive the list-completed indicator from the current draft.
- Use functional state transitions so updates never depend on stale render closures.

Run the state-consistency and list-switch tests until green.

### Phase 3: Implement ordered, recoverable autosave

- Add a per-list serialized and coalescing save queue.
- Track local draft revisions and server acknowledgements.
- Preserve dirty drafts across list switches.
- Add explicit retry and accurate persistence status.
- Decide and test page-exit behavior.

Run the unmount, ordering, failure, retry, and Playwright persistence tests until green.

### Phase 4: Introduce Zod at runtime boundaries

- Define the todo, todo-list, update-request, and API-response schemas.
- Parse requests before they reach the store.
- Parse responses before the frontend accepts them as application state.
- Return consistent JSON validation errors.
- Add strict calendar-date and unique-ID refinements.

Run the schema unit tests and HTTP integration tests until green.

### Phase 5: Clarify due-date behavior and small maintainability issues

- Make due status aware of completion.
- Return structured due information such as `{ label, kind, days }` instead of deriving color by
  searching a display string for the word `overdue`.
- Replace closure-based `setTodos(...)` calls with functional updates, unless the controlled-form
  redesign removes them.
- Abort or otherwise retire the initial list fetch when its owner unmounts.
- Add retry for initial load errors.
- Add Express JSON error middleware so malformed input receives the same JSON error contract.
- Remove the unused store `reset` function.
- Document Playwright browser installation if a clean checkout requires it.

Run the date, component, API, lint, build, and complete end-to-end suites until green.

### Phase 6: Record final green proof

The implementation is not complete until the new regressions and the full suite pass. Record at
least the following evidence:

```text
# Focused regression tests
npm test --prefix frontend -- --watchAll=false <focused tests>
npm test --prefix backend -- <focused tests>
npm run test:e2e -- <focused tests>

# Complete verification
npm test
npm run test:e2e
npm run lint
npm run build --prefix frontend
```

The final review record should include:

- The original red output.
- The final green output for the same tests.
- Full-suite counts.
- The Node version used, including a run on the repository's specified Node 20 version.
- Any intentionally deferred behavior and its reason.

## Response to the four proposed improvements

### 1. Upgrade to React 19 and use Suspense

Decision: defer this from the correctness fix and evaluate it as a separate modernization change.

Why:

- React 19 does not remove the need to synchronize autosave with an external server.
- Suspense can improve initial data loading when paired with a compatible data source, but it does
  not solve mutation ordering, dirty-state ownership, retries, or unmount data loss.
- The installed MUI 5.15 and Testing Library 14 packages declare React 17/18 or React 18 peer ranges.
  A React 19 change therefore requires coordinated dependency upgrades and its own verification.
- Combining an ecosystem upgrade with behavioral fixes would make regressions harder to attribute
  and the interview story less clear.

How to revisit it:

- First complete the autosave and contract fixes on React 18.
- Then plan a separate framework and dependency upgrade.
- Use Suspense only if the selected data layer provides a clear loading and error-boundary model.
- Compare the resulting code with the focused hooks from this plan. Adopt it only if it makes the
  ownership and failure behavior clearer.

### 2. Replace explicit test assertions with snapshots

Decision: do not broadly replace the current assertions with snapshots.

Why:

- Autosave ordering, retry behavior, accessibility, and persistence are behavioral contracts.
  Explicit assertions state those contracts directly.
- Large component snapshots are sensitive to MUI markup and can change without user-visible
  behavior changing.
- Snapshot updates are easy to accept without understanding which behavior changed.
- The current tests need stronger failure-path coverage, not shorter assertion files.

Appropriate limited use:

- A small inline snapshot may be reasonable for a stable, serializable validation error payload if
  the complete payload is the contract under review.
- Even then, important fields such as error code and path should normally have explicit assertions.
- Do not snapshot full rendered MUI trees.

### 3. Use Zod for runtime validation

Decision: adopt this proposal.

Why:

- The handwritten validator already misses real invalid states proven by red tests.
- Runtime validation is required at HTTP boundaries even if TypeScript is introduced later.
- A schema gives the server, client, and tests a concrete shared definition of valid data.
- Structured issues make API errors easier to explain and handle.

How:

- Introduce strict schemas and refinements as described in P2-3.
- Keep one authoritative contract where the build structure permits it.
- Add schema unit tests and HTTP integration tests before replacing the predicate.
- Confirm each new test is red against the handwritten validation and green after Zod is wired in.

### 4. Use Immutable instead of deep equality

Decision: do not introduce Immutable.js for this assignment.

Why:

- Production code does not perform deep equality. `deepEqual` appears in tests where comparing
  complete serializable values is appropriate.
- The application already uses native immutable array and object updates.
- Immutable.js would introduce a second collection model and conversion at the React and JSON API
  boundaries.
- That additional abstraction would make this small application harder to read without solving
  the autosave correctness problems.

How to improve the current approach:

- Use functional React state updates to avoid stale closures.
- Keep plain serializable objects at API boundaries.
- Continue using `structuredClone` for defensive store isolation while the dataset is small.
- Consider Immer only if future nested state transitions become difficult to express and tests
  demonstrate that the additional abstraction improves clarity.

## Maintainability improvements

The following improvements should be included where they naturally fit the correctness work:

1. **Explicit state machine:** Replace loosely related `saveState`, `saveError`, draft, and server
   values with named transitions for clean, dirty, saving, and error states.
2. **Functional updates:** Avoid `setTodos(updateTodoAt(todos, ...))`; derive the next state from the
   current state supplied by React.
3. **Structured domain results:** Return a due-status kind separately from its display label instead
   of inspecting presentation text to decide its color.
4. **Consistent errors:** Use one JSON error shape for validation, missing resources, malformed JSON,
   and unexpected server failures.
5. **Boundary validation:** Validate incoming requests and incoming API responses before they become
   application state.
6. **Focused modules:** Keep network scheduling, draft state, domain calculations, and presentation
   separate enough to test without rendering the whole application.
7. **Deterministic tests:** Use fake timers and controlled promises for debounce and ordering tests;
   reserve real browser timing for a few complete user journeys.
8. **Remove dead code:** Delete `store.reset` unless an approved test design starts using it.
9. **Accessible recovery:** Make Retry a clearly named control and keep save status in an appropriate
   live region.
10. **Clean-checkout verification:** Document all installation steps and verify Node 20, Playwright,
    lint, tests, and production build from a clean dependency installation.

## Decisions recommended for approval

The proposed implementation should proceed with these decisions:

- Keep React 18 during the correctness work.
- Do not introduce broad snapshot testing.
- Adopt Zod runtime validation with an authoritative contract.
- Keep plain JavaScript objects and native immutable updates; do not add Immutable.js.
- Centralize per-list drafts above the form.
- Serialize and coalesce saves per list.
- Preserve dirty data and provide explicit retry.
- Derive every visible list state from the current draft.
- Treat completed todos as completed rather than currently overdue.
- Require red proof before each fix and green proof afterward.

## Definition of done

The follow-up implementation is complete only when:

- Every P1 and P2 finding has a permanent regression test.
- Each regression test is demonstrated failing against the original Grok commit.
- The same tests pass after the fix.
- Existing behavior remains covered and green.
- Unit, API integration, frontend component, Playwright, lint, and production build checks pass.
- Error and loading states remain understandable and accessible.
- No stale response can replace a newer draft.
- Switching lists cannot discard an edit.
- A failed save remains visibly dirty and can be retried.
- Invalid dates and duplicate IDs are rejected at runtime.
- The final code and documentation explain the ownership, ordering, validation, and failure model in
  terms a developer can verify from the tests.

## Final green proof

Implemented after approval of this review. This section is a historical verification
snapshot of that milestone (reducer + `createSaveQueue`). Current persistence and
autosave ownership live in [`DECISIONS.md`](./DECISIONS.md) and
[`docs/adr/002-xstate-actors.md`](./docs/adr/002-xstate-actors.md).

### Focused regressions (green at that milestone)

```text
# Shared contract
npm test --prefix shared
  5 passed (impossible date, duplicate ids, empty ids, unknown props, valid request)

# Backend store + API
npm test --prefix backend
  14 passed (includes impossible date, duplicate ids, malformed JSON)

# Frontend
CI=true npm test --prefix frontend -- --watchAll=false
  34 passed (save queue, draft reducer, list-switch flush, retry, completion-from-draft,
             completed-not-overdue, API response contract)

# E2E
npm run test:e2e
  4 passed (persist, complete+refresh, due+refresh, list-switch before debounce)
```

### Complete verification

```text
npm test                 # shared + backend + frontend — all green
npm run test:e2e         # 4 passed
npm run lint             # passed
npm run build --prefix frontend  # compiled successfully
```

Node used during verification: `v24.5.0` (repo `.nvmrc` specifies 20; Node 20 was not
available via nvm in the verification environment). CRA build and all suites above are green
on the verified Node. Shared package consumed by Create React App without ejecting.

### Intentionally deferred (unchanged from review decisions)

- React 19 / Suspense
- Broad snapshot testing
- Immutable.js
- Multi-client ETags / server versions
