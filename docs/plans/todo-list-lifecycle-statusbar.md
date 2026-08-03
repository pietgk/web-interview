# Implementation plan: Todo List lifecycle and StatusBar

Status: Ready for implementation in a fresh session.

This document is the implementation handoff. It consolidates the confirmed grilling decisions, the repository audit, and the final Lavish review comments. The Lavish HTML is a visual review artifact, not the source of truth for implementation.

## Fresh-session objective

Implement Todo List creation, renaming, deletion, urgency summaries, urgency sorting, and the global StatusBar described below. Preserve the existing optimistic transaction model, durable IndexedDB outbox, 400 ms backend synchronization debounce, complete authoritative read-model response, and JSONL journal durability.

Before editing, read:

- `AGENTS.md` instructions supplied by the environment
- `CONTEXT.md`
- `docs/adr/003-shared-datom-actor.md`
- this plan

Preserve unrelated working-tree changes. Do not use the Lavish mock as exact source code or exact iconography.

## Confirmed product behavior

### Todo List creation

- Keep the heading `My Todo Lists`.
- Place one standalone add `IconButton` below the Todo List rows, aligned with the leading list-icon column.
- The button has the accessible name `Add Todo List`.
- Clicking it selects a blank, non-persisted new-list draft and focuses the active card's `Todo List name` field.
- Do not put a second list-name input inside `My Todo Lists`.
- Do not put another add button beside `Todo List name`.
- While the draft name is blank, render only the name field. Hide save information and Todo controls.
- The first non-whitespace character materializes the Todo List through an optimistic transaction.
- After materialization, show the Todo composer and existing Todo controls immediately.
- If the add button is pressed again while an unmaterialized blank draft is active, refocus the existing draft instead of creating another draft.
- If a blank draft is abandoned by selecting an existing list, discard it without a transaction.

### Todo List naming and renaming

- Replace the active card's static title with one outlined `TextField` labeled `Todo List name`.
- Use this field for both initial naming and later renaming.
- Names contain 1 through 100 characters after trimming surrounding whitespace.
- Duplicate names are valid. Stable IDs, not titles, define identity.
- Valid title changes update the optimistic read model immediately, persist to IndexedDB, and join the existing 400 ms backend sync debounce.
- Clearing an existing name never deletes the Todo List.
- A blank rename remains local, shows `Todo List name is required`, and does not create a transaction.
- On blur, accept and trim a valid name. Restore the last saved name when blank.
- Enter accepts a valid name and focuses `Add a todo`.
- Escape cancels an unmaterialized draft or restores the last saved name while renaming.

### Todo List navigation rows

- Keep the current completion-aware leading icon. A completed non-empty Todo List still uses the green checkmark.
- Render the exact same MUI delete treatment used by `TodoItem`: `IconButton`, `color='secondary'`, and `DeleteIcon` from `@mui/icons-material/Delete`.
- Do not use placeholder glyphs from the Lavish mock.
- The accessible name is `Delete Todo List: {title}`.
- The select button and delete button must be sibling controls. Do not nest an `IconButton` inside `ListItemButton`.
- Prefer MUI `ListItem` with a secondary action so selection and deletion remain semantically independent.

### Todo List deletion

- Delete an empty Todo List immediately.
- Before deleting a non-empty Todo List, open a confirmation dialog naming the list and stating how many Todos will also disappear.
- One atomic transaction asserts `list/deleted = true`.
- The projector excludes a deleted Todo List and all of its Todos from the complete read model.
- Keep historical facts in the JSONL journal. Do not retract or rewrite history.
- If the active list is deleted, select the next displayed list. If none follows, select the previous list.
- If no Todo Lists remain, focus the collection add button.
- Do not add Undo.
- History, activity, and restoration UI are deferred. The future direction is a history icon before `My Todo Lists` for aggregated activity and another before the active Todo List title for list-scoped activity.

### Next Due Date and display order

- Define Next Due Date as the earliest due date among incomplete Todos in a Todo List.
- Completed Todos never contribute to Next Due Date.
- Add `nextDueDate` to the existing derived list summary beside `completed`, `completedCount`, and `totalCount`.
- Do not store Next Due Date in transactions or either read model.
- Keep each navigation row at two text lines.
- Extend the secondary line, for example: `1 of 10 completed · Due in 3 days`.
- Reuse the existing due-status wording from `getDueStatus`.
- Render only an overdue phrase in the error color. Keep completion count, upcoming dates, and today's status in normal secondary text.
- Sort the displayed Todo Lists as follows:

  1. Incomplete Todo Lists with a Next Due Date, ascending by date. The most overdue list appears first.
  2. Incomplete or empty Todo Lists without a Next Due Date, preserving creation order.
  3. Completed Todo Lists, preserving creation order.

- Equal due dates preserve creation order.
- Re-sort immediately from the optimistic read model when a Todo due date or completion changes.
- Preserve active selection by stable ID when its navigation row moves.
- On initial load, automatically select the first Todo List in derived display order.

## StatusBar

### Name and placement

- The canonical module and UI name is `StatusBar`.
- `StatusBar` replaces `MainAppBar` and the active-list `SaveStatus` line.
- `Alert` is only the MUI rendering primitive inside `StatusBar`; do not name the top-level module AlertBar.
- Reserve `DevBar` as the name of a possible future bottom application region.
- Use one outlined MUI `Alert` aligned to the same maximum width as the Todo List cards.
- Use a full-height application shell where StatusBar remains at the top and only the main content region scrolls.
- Prefer normal flex layout or sticky positioning over viewport-fixed positioning that requires content-offset calculations.

### Composable status line

- Treat the line as ordered status parts.
- The first stable part is `Things to do`, rendered as the permanent page `h1`.
- The remaining parts describe durability, synchronization, warnings, errors, and recovery.
- A pure selector produces one status model:

```js
{
  severity: 'warning',
  parts: [
    { id: 'title', text: 'Things to do' },
    { id: 'durability', text: 'Saved on this device' },
    { id: 'sync', text: 'Server sync failed' },
  ],
  action: { label: 'Retry server synchronization', event: 'RETRY_SYNC' },
  details: null,
  dismissible: false,
}
```

- Join parts with subtle visual dividers.
- Wrap cleanly on narrow screens.
- Do not allow independent parts to produce contradictory messages.
- The complete Alert uses the highest active severity.

### Status priority and wording

Use this deterministic priority:

| Priority | Condition | Severity | Visible parts after `Things to do` | Actions |
|---|---|---|---|---|
| 1 | Local IndexedDB write failed | error | `Changes are not safely saved` | Retry local save, Details |
| 2 | Backend rejected a transaction | error | `A change could not be applied` | Review, dismiss notification |
| 3 | Backend synchronization failed | warning | `Saved on this device · Server sync failed` | Retry server synchronization, Details |
| 4 | Browser offline with pending work | warning | `Saved on this device · Waiting for connection` | Details when useful; reconnect automatically |
| 4 | Browser offline without pending work | warning | `Offline · No unsynchronized changes` | Details when useful; reconnect automatically |
| 5 | IndexedDB write in progress | info | `Saving on this device…` | None |
| 6 | Locally durable and pending or synchronizing | info | `Saved on this device · Synchronizing…` | None |
| 7 | No outstanding work | success | `All changes saved` | None |
| Startup | Initial loading | info | `Loading Todo Lists…` | None |
| Startup | Initial loading failed | error | `Todo Lists could not be loaded` | Retry loading, Details |

- Do not show every internal actor transition.
- The three normal autosave stages are local saving, locally durable plus synchronizing, and all changes saved.
- Avoid re-announcing identical status text on every keystroke.

### Status actions and Details

- Recovery actions target the failed layer. Do not keep the current combined Retry action.
- Local persistence failure sends `RETRY_PERSISTENCE`.
- Sync failure sends `RETRY_SYNC`.
- Initial load failure sends `RELOAD`.
- Offline status has no Retry action because the actor already resumes on the browser's online event.
- Rejected transactions are not retried unchanged.
- `Details` is generic and appears only when meaningful information exists.
- A compact `StatusDetailsDialog` may show:

  - affected Todo List
  - human-readable failure or rejection reason
  - confirmation that an optimistic rejected change was rolled back
  - validation details when available
  - `Open Todo List` when that list still exists

- Do not expose raw datoms in the normal details UI.
- Rejected notifications may be dismissed after review. Dismissal clears only the displayed rejection notification and never changes the authoritative read model.
- Do not allow unresolved persistence failure, synchronization failure, or offline conditions to be dismissed.
- MUI 5.18 only renders the default `onClose` icon when no `action` prop exists. When Details and dismissal coexist, render the equivalent close `IconButton` inside the Alert action group.

### StatusBar state-machine decision

Do not create a second state machine for StatusBar.

The existing shared `TodoListActor` already owns the temporal persistence and synchronization states. StatusBar has no independent protocol; it is a pure projection of the actor snapshot plus local open/closed dialog state. A second machine would duplicate state and create opportunities for divergence.

Keep the story explicit and inspectable:

```text
TodoListActor snapshot -> selectStatusBar(snapshot) -> StatusBar render
                                           |
                                           -> actor event for Retry or dismissal
```

Use a pure, exhaustively tested selector for StatusBar logic. Use local React state only for opening and closing Details.

The Todo List interaction flow does justify an explicit finite UI reducer because browsing, blank drafting, valid materialization, and delete confirmation have exclusive transitions and focus consequences. Implement a small reducer module rather than reintroducing the superseded XState actor hierarchy:

```text
browsing(activeListId)
  + ADD_LIST -> drafting(reservedListId, blank title)

drafting
  + first valid title -> browsing(materializedListId)
  + SELECT_LIST or ESCAPE -> browsing(selectedId or null)

browsing
  + REQUEST_DELETE(non-empty) -> confirmingDelete(activeListId, targetListId)

confirmingDelete
  + CANCEL -> browsing(activeListId)
  + CONFIRM -> browsing(nearestRemainingId)
```

Keep persistence state out of this reducer. Transactions still go directly through the shared actor.

## Architecture and module seams

### One runtime instance

`useTodoLists()` currently creates the browser actor inside `TodoLists`. Lift this runtime to application composition so StatusBar and Todo Lists share exactly one actor and snapshot.

Preferred shape:

```jsx
const App = () => {
  const runtime = useTodoLists()

  return (
    <ApplicationShell
      status={<StatusBar runtime={runtime} />}
      content={<TodoLists runtime={runtime} />}
    />
  )
}
```

- Do not call `useTodoLists()` twice.
- Do not create a second IndexedDB adapter.
- Do not add React context unless prop passing grows beyond the top-level StatusBar, TodoLists, and future DevBar composition.
- Passing one runtime interface from App is the smallest useful seam today.

### Persistence path remains unchanged

```text
UI intent
  -> transaction builder
  -> shared TodoListActor optimistic database
  -> IndexedDB pending transaction
  -> existing 400 ms synchronization debounce
  -> POST /api/todo-lists/sync
  -> server TodoListActor
  -> JSONL append and datasync
  -> complete authoritative Todo Lists read model
  -> rebase remaining local transactions
  -> one snapshot rendered by StatusBar and Todo Lists
```

No new HTTP endpoint is required.

## Shared-model changes

### Protocol and types

Update `shared/src/todoProtocol.js` and `shared/src/types.js`:

- add `TODO_LIST_TITLE_MAX_LENGTH = 100`
- add transaction causes for list creation, title change, and deletion
- add `list/deleted` to the attribute union
- add an actor event for dismissing reviewed rejection notifications
- extend relevant JSDoc types for StatusBar models and new transaction builders

### Transactions

Update `shared/src/transactions.js`:

- add `newTodoListId()`
- add `createTodoListAtBottomTransaction(...)`
- add `patchTodoListTitleTransaction(...)`
- add `deleteTodoListTransaction(...)`
- set `origin.listId` for all list transactions so rejection and status details remain attributable
- include `list/title`, `list/order`, and `list/deleted = false` atomically when creating
- use a monotonically increasing time-based order for new lists so they follow seeded creation order before derived urgency sorting

### Database, projector, and contracts

Update `shared/src/todoDatabase.js` and `shared/src/todoContract.js`:

- accept and apply `list/deleted`
- treat missing `list/deleted` as false so existing journals remain replayable
- add `list/deleted = false` in seed transactions and `databaseFromReadModel`
- exclude tombstoned lists from `projectTodoLists`
- because deleted list facts remain present, existing Todo-to-list referential validation stays valid
- enforce valid new and renamed titles at the incoming transaction seam
- add a regression test that replays a pre-feature journal record without `list/deleted`

Do not add deletion state to the external read model. The complete read model contains only visible Todo Lists.

### Selectors

Update `shared/src/selectors.js`:

- extend `selectListSummary(todoList)` with `nextDueDate`
- add a selector that returns Todo List summaries in the confirmed display order
- preserve source order as the tie-breaker
- replace `selectListSaveChrome` with a global `selectStatusBar(snapshot)` selector
- make StatusBar priority exhaustive and deterministic
- include state-specific actor event descriptors, details metadata, and dismissal metadata in the result

## Frontend changes

### Application shell

Update `frontend/src/App.jsx`:

- remove `MainAppBar`
- create the Todo runtime once
- render `StatusBar` above the scrollable main content
- align StatusBar and Todo List cards to the existing 80rem maximum width
- keep the StatusBar visible while only main content scrolls

### New modules

Add:

- `frontend/src/todos/components/StatusBar.jsx`
- `frontend/src/todos/components/StatusDetailsDialog.jsx`
- `frontend/src/todos/components/TodoListTitleField.jsx`
- `frontend/src/todos/todoListsUiState.js` for the explicit finite UI reducer

Remove `SaveStatus.jsx` only after its behavior is fully replaced and tests exercise the StatusBar interface.

### TodoLists

Refactor `frontend/src/todos/components/TodoLists.jsx`:

- accept the single runtime from App instead of creating its own
- render the collection card even when zero lists exist
- consume sorted summaries from the shared selector
- use the UI reducer for browsing, drafting, and delete confirmation
- add the standalone collection plus button
- render the exact TodoItem-style DeleteIcon button on each list row
- keep select and delete controls as siblings
- stop deletion clicks from changing selection through structure, not event hacks
- keep selection stable by ID during sorting
- implement initial selection and nearest-list selection after deletion
- focus the add button when the final list disappears

### TodoListForm and title field

Refactor `TodoListForm.jsx`:

- replace static title Typography with `TodoListTitleField`
- remove per-list SaveStatus
- hide TodoEditor for an unmaterialized draft
- expose a focus path from accepted title to TodoComposer
- keep the current Todo ghost composer behavior unchanged

## Testing plan

### Shared tests

Add tests before implementation for:

- atomic list creation with title, order, and non-deleted state
- title patch no-op behavior
- list tombstone deletion
- projector hiding a deleted list and its Todos
- replay of old transactions without `list/deleted`
- offline pending deletion replay over the authoritative read model
- earliest incomplete Next Due Date
- completed Todos excluded from Next Due Date
- all three sorting buckets and stable ties
- every StatusBar priority, wording, action, Details, and dismissal rule
- actor rejection dismissal without changing the read model

Test observable outcomes through transaction, actor, and selector interfaces rather than private maps.

### Frontend tests

Cover:

- one runtime instance shared by StatusBar and TodoLists
- blank draft rendering and focus
- first non-whitespace materialization
- no duplicate draft from repeated add clicks
- rename autosave, trimming, duplicates, maximum length, and blank validation
- Enter, Escape, blur, and focus transfer
- exact delete IconButton accessible names
- delete confirmation only for non-empty lists
- next/previous selection after deletion
- zero-list state and add-button focus
- live derived sorting without losing active editor selection
- StatusBar severity, parts, responsive action group, live-region roles, Details dialog, and dismissal
- UI reducer transition table as pure tests

### End-to-end journeys

Extend `e2e/todos.spec.js` using the real browser, frontend, backend actor, and temporary JSONL journal:

1. Create a Todo List, type its name, add a Todo, wait for sync, reload, and verify both persist.
2. Rename a Todo List, switch before 400 ms, verify synchronization, then reload.
3. Create while offline, reload from IndexedDB, reconnect, and verify backend synchronization.
4. Derive and display Next Due Date, then move the list immediately when due date changes.
5. Move a completed list to the completed bucket while keeping it active.
6. Delete an empty list immediately.
7. Cancel and confirm deletion of a non-empty list.
8. Delete the active and final lists and verify focus recovery.
9. Exercise success, saving, offline, sync failure, retry, rejection review, Details, and dismissal in the global StatusBar.
10. Verify keyboard-only creation, renaming, deletion confirmation, and dialog focus return.

Create unique lists inside lifecycle tests so persistent tombstones do not contaminate later seed-based tests.

### Verification gate

Run and fix every failure:

```sh
npm test
npm run test:e2e
npm run typecheck
npm run lint
npm run build --prefix frontend
```

Inspect the real UI at desktop and narrow widths. Be strict about alignment, wrapping, focus visibility, accidental nested controls, StatusBar height changes, and scroll behavior.

## Documentation completion

- Keep `CONTEXT.md` as the domain glossary. It already defines Todo Lists, Todo List, Todo, and Next Due Date.
- Update `DECISIONS.md` after implementation so “Creating or deleting whole lists” is no longer listed as deferred and the global StatusBar behavior is documented.
- Do not create a new ADR. The tombstone follows the accepted datom architecture, and the UI decisions are visible and reversible.
- Do not implement the deferred history or restoration UI in this change.

## Definition of done

- Users can create, name, rename, and delete Todo Lists through the UI.
- All list mutations survive reload, offline use, reconnection, backend synchronization, and server restart through the existing persistence model.
- Next Due Date and list order are derived from the optimistic complete read model.
- StatusBar is the only application save and synchronization status surface.
- The exact TodoItem DeleteIcon pattern is reused for Todo Lists.
- The Todo List UI reducer and StatusBar selector make the UI, logic, and data flow easy to explain without duplicating persistence state.
- All verification commands pass and the rendered UI is visually sound.
