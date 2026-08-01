import React from 'react'
import { Card, CardContent, Button, Typography } from '@mui/material'
import { TodoComposer } from './TodoComposer'
import { TodoItem } from './TodoItem'

/** True when focus left this element for something outside it (not a child). */
const focusLeft = (event) => !event.currentTarget.contains(event.relatedTarget)

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
  const todos = todoList.todos
  const titleId = `todo-list-title-${todoList.id}`
  const saveFailed = saveChrome.tone === 'error'

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
        <div
          role={saveFailed ? 'alert' : 'status'}
          aria-label='Save status'
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '0.5rem',
            minHeight: '1.25rem',
          }}
        >
          <Typography
            variant='body2'
            color={saveFailed ? 'error' : 'text.secondary'}
          >
            {saveChrome.message}
          </Typography>
          {saveChrome.showRetry && (
            <Button
              type='button'
              size='small'
              color='primary'
              onClick={() => send({ type: 'RETRY_SAVE' })}
              aria-label='Retry saving todo list'
            >
              Retry
            </Button>
          )}
        </div>
        <div
          role='region'
          aria-label='Todo editor'
          style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}
          onBlur={(event) => {
            if (focusLeft(event)) {
              send({ type: 'COMPOSER_COMMIT' })
              send({ type: 'FLUSH_ACTIVE' })
            }
          }}
        >
          <div
            role='group'
            aria-label='New todo'
            onBlur={(event) => {
              if (focusLeft(event)) {
                send({ type: 'COMPOSER_COMMIT' })
              }
            }}
          >
            <TodoComposer
              text={composerText}
              onChange={(text) => send({ type: 'COMPOSER_CHANGE', text })}
              onSubmit={() => send({ type: 'COMPOSER_SUBMIT' })}
            />
          </div>
          {todos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onChange={(patch) => send({ type: 'TODO_PATCH', id: todo.id, patch })}
              onRemove={() => send({ type: 'TODO_REMOVE', id: todo.id })}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
