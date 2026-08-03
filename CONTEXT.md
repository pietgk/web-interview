# Todo Lists

This context describes how people organize and track work in the todo application.

## Language

**Todo Lists**:
The complete collection of Todo Lists. The collection may contain zero Todo Lists.
_Avoid_: Model, lists

**Todo List**:
A named, ordered collection of zero or more Todos.
_Avoid_: List, todoList

**Todo**:
A task belonging to exactly one Todo List.
_Avoid_: Item, task

**Next Due Date**:
The earliest due date among the incomplete Todos in a Todo List. It is absent when no incomplete Todo has a due date.
_Avoid_: First due date, list due date
