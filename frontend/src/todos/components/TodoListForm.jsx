import React, { useRef } from 'react'
import { Card, CardContent } from '@mui/material'
import { TodoComposer } from './TodoComposer'
import { TodoEditor } from './TodoEditor'
import { TodoItem } from './TodoItem'
import { TodoListTitleField } from './TodoListTitleField'
import { TODO_UI_EVENT } from '../todoUiProtocol'

/** @typedef {import('@web-interview/todos/types').TodoList} TodoList */
/** @typedef {import('../todoUiProtocol').TodoUiEvent} TodoUiEvent */

/**
 * @param {{
 *   todoList: TodoList,
 *   composerText?: string,
 *   draft?: boolean,
 *   autoFocusTitle?: boolean,
 *   titleFocusRef?: React.MutableRefObject<HTMLInputElement | null>,
 *   onMaterialize: (title: string) => void,
 *   onTitleChange: (title: string) => void,
 *   onCancelDraft: () => void,
 *   send: (event: TodoUiEvent) => void
 * }} props
 */
export const TodoListForm = ({
  todoList,
  composerText = '',
  draft = false,
  autoFocusTitle = false,
  titleFocusRef,
  onMaterialize,
  onTitleChange,
  onCancelDraft,
  send,
}) => {
  const composerRef = useRef(/** @type {HTMLInputElement | null} */ (null))

  return (
    <Card
      sx={{ margin: '0 1rem' }}
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
          <TodoEditor onLeave={() => send({ type: TODO_UI_EVENT.FLUSH })}>
            <TodoComposer
              text={composerText}
              focusRef={composerRef}
              onChange={(text) => send({ type: TODO_UI_EVENT.COMPOSER_CHANGE, text })}
              onSubmit={() => send({ type: TODO_UI_EVENT.COMPOSER_SUBMIT })}
              onCommit={() => send({ type: TODO_UI_EVENT.COMPOSER_COMMIT })}
            />
            {todoList.todos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onChange={(patch) => send({
                  type: TODO_UI_EVENT.TODO_PATCH,
                  id: todo.id,
                  patch,
                })}
                onRemove={() => send({
                  type: TODO_UI_EVENT.TODO_REMOVE,
                  id: todo.id,
                })}
              />
            ))}
          </TodoEditor>
        )}
      </CardContent>
    </Card>
  )
}
