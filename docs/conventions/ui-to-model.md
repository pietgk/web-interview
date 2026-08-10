# UI ↔ model convention (checklist)

Companion to [ADR 007](../adr/007-ui-to-model-convention.md). After an interaction, classify by
**what changed** (domain fact → command; screen offering → event; unsettled text → wait for
settle). Only `todoListCommands.js` knows datoms exist.

## Interaction checklist

| Interaction | What changed | Reaches the model as |
| --- | --- | --- |
| Click a Todo List row | which list is on screen | event `SELECT_LIST` |
| Click Add | the screen offers a draft | event `ADD_LIST` |
| Escape a draft | the screen stops offering it | event `ESCAPE_DRAFT` |
| Delete a list holding Todos | the screen offers a confirmation | event `REQUEST_DELETE` |
| Cancel the dialog | the screen stops offering it | event `CANCEL_DELETE` |
| Name a draft list | a Todo List exists, **and** drafting ends | `renameList()` **and** event `MATERIALIZE` |
| Confirm the dialog | the list stops existing, **and** selection moves | `deleteList()` **and** event `CONFIRM_DELETE` |
| Delete an empty list | as above, without the confirmation | `deleteList()` **and** event `CONFIRM_DELETE` |
| Rename an existing list | a fact, once the field settles | in-flight, then `renameList()` |
| Type in a Todo's text | a fact, once the field settles | in-flight, then `retitleTodo()` |
| Composer settles non-blank, unlinked | a Todo starts existing | in-flight, then `addTodo()` |
| Composer settles non-blank, linked | that Todo's text | in-flight, then `retitleTodo()` |
| Composer settles blank, linked | that Todo stops existing | in-flight, then `deleteTodo()` |
| Toggle a checkbox | a fact, immediately | `setTodoCompleted()` |
| Pick or clear a due date | a fact, immediately | `setTodoDueDate()` |
| Delete a Todo | that Todo stops existing | `deleteTodo()` |

A new interaction that does not classify signals that the ADR premise moved — not a fourth
convention.

## Module map

| Module | Owns | Kind |
| --- | --- | --- |
| `components/*.jsx` | nothing | render |
| `todoListsUiState.js` | screen state | events |
| `todoListsScreenView.js` | nothing; pure projection of read model plus screen state | read |
| `todoListCommands.js` | the only knowledge that datoms exist | commands |
| `useSettledText.js` | in-flight text, and the only settle timer | timing |
| `useGhostComposer.js` | in-flight text plus materialization, over `useSettledText` | timing |

A component may import screen-view output, an event dispatcher, and commands. It may not import
`@web-interview/todos/datom` (ESLint enforces this).

Commands (named after what a person did):

```text
reserveListId()                   renameList(listId, title)
deleteList(todoList)              addTodo(listId, text) -> id
retitleTodo(todo, text)           setTodoCompleted(todo, completed)
setTodoDueDate(todo, dueDate)     deleteTodo(todo)
```

## Screen machines (source is authoritative)

Navigation lives in `todoListsUiState.js`; settling in `useSettledText.js`; the ghost composer in
`useGhostComposer.js` (settling machine plus materialization rules — not a fourth owner). Facts
have no UI state machine; StatusBar is a pure projection of client status
([`docs/architecture.md`](../architecture.md)).
