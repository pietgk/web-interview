import React, { useRef } from 'react'
import { Card, CardContent } from '@mui/material'
import { TodoComposer } from './TodoComposer.tsx'
import { TodoEditor } from './TodoEditor.tsx'
import { TodoItem } from './TodoItem.tsx'
import { TodoListTitleField } from './TodoListTitleField.tsx'
import { useGhostComposer } from '../useGhostComposer.ts'
import type { TodoList } from '@web-interview/todos/types'
import type { TodoListCommands } from '../todoListCommands.ts'

export const TodoListForm = ({
  todoList,
  commands,
  today,
  draft = false,
  autoFocusTitle = false,
  titleFocusRef,
  onMaterialize,
  onTitleChange,
  onCancelDraft,
}: {
  todoList: TodoList,
  commands: TodoListCommands,
  today: string,
  draft?: boolean,
  autoFocusTitle?: boolean,
  titleFocusRef?: React.MutableRefObject<HTMLInputElement | null>,
  onMaterialize: (title: string) => void,
  onTitleChange: (title: string) => void,
  onCancelDraft: () => void
}) => {
  const composerRef = useRef<HTMLInputElement | null>(null)
  const composer = useGhostComposer(todoList, commands)

  return (
    <Card
      sx={(theme) => ({ marginX: theme.todos.layout.gutter })}
      component='section'
      aria-label={draft ? 'New Todo List' : `Todo List: ${todoList.title}`}
    >
      <CardContent>
        <TodoListTitleField
          title={todoList.title}
          draft={draft}
          autoFocus={autoFocusTitle}
          focusRef={titleFocusRef}
          onMaterialize={onMaterialize}
          onTitleChange={onTitleChange}
          onCancelDraft={onCancelDraft}
          onAccept={() => composerRef.current?.focus()}
        />

        {!draft && (
          <TodoEditor>
            <TodoComposer
              text={composer.text}
              focusRef={composerRef}
              onChange={composer.change}
              onSubmit={composer.commit}
              onCommit={composer.commit}
            />
            {composer.visibleTodos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                today={today}
                onChange={(patch) => {
                  if ('text' in patch) {
                    commands.retitleTodo(todo, patch.text as string)
                  }
                  if ('completed' in patch) {
                    commands.setTodoCompleted(todo, patch.completed as boolean)
                  }
                  if ('dueDate' in patch) {
                    commands.setTodoDueDate(todo, patch.dueDate ?? null)
                  }
                }}
                onRemove={() => commands.deleteTodo(todo)}
              />
            ))}
          </TodoEditor>
        )}
      </CardContent>
    </Card>
  )
}
