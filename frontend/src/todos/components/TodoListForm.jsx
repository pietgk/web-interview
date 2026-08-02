import React from 'react'
import { Card, CardContent, Typography } from '@mui/material'
import { SaveStatus } from './SaveStatus'
import { TodoComposer } from './TodoComposer'
import { TodoEditor } from './TodoEditor'
import { TodoItem } from './TodoItem'
import { TODO_UI_EVENT } from '../todoUiProtocol'

export const TodoListForm = ({
  todoList,
  composerText = '',
  saveChrome = {
    message: null,
    tone: 'secondary',
    showRetry: false,
  },
  send,
}) => {
  const titleId = `todo-list-title-${todoList.id}`

  return (
    <Card
      sx={{ margin: '0 1rem' }}
      component='section'
      aria-labelledby={titleId}
    >
      <CardContent>
        <Typography id={titleId} component='h2'>
          {todoList.title}
        </Typography>

        <SaveStatus
          saveChrome={saveChrome}
          onRetry={() => send({ type: TODO_UI_EVENT.RETRY })}
        />

        <TodoEditor onLeave={() => send({ type: TODO_UI_EVENT.FLUSH })}>
          <TodoComposer
            text={composerText}
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
      </CardContent>
    </Card>
  )
}
