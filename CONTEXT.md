# Todo Lists

This context describes how people organize and track work in the todo application.

## Language

**Todo Lists**:
The complete collection of Todo Lists. The collection may contain zero Todo Lists.
_Avoid_: Model, lists

**Todo List**:
A named, ordered collection of zero or more Todos.
A Todo List exists while it has a title. Deleting one takes its title away, and giving the title
back brings the Todo List and its Todos with it.
Two Todo Lists may share a title. A Todo List is identified by itself, not by what it is called.
_Avoid_: List, todoList

**Todo**:
A task belonging to exactly one Todo List, for its whole life.
A Todo exists while it has text. Deleting one takes its text away, and giving the text back
brings its completion and due date with it.
_Avoid_: Item, task

**Completed Todo List**:
A Todo List containing at least one Todo, where every Todo is completed. An empty Todo List is not
completed.
_Avoid_: Done Todo List, completed list

**Next Due Date**:
The earliest due date among the incomplete Todos in a Todo List. It is absent when no incomplete Todo has a due date.
_Avoid_: First due date, list due date
