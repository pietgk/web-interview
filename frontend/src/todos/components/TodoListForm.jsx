import React from 'react'
import { Card, CardContent, Button, Typography } from '@mui/material'
import { TodoItem } from './TodoItem'

export const TodoListForm = ({
  todoList,
  composerText = '',
  saveChrome = {
    message: null,
    tone: 'secondary',
    showRetry: false,
  },
  onComposerChange,
  onComposerCommit,
  onTodoPatch,
  onTodoRemove,
  onRetry,
  onBlurSave,
}) => {
  const todos = todoList.todos

  return (
    <Card sx={{ margin: '0 1rem' }}>
      <CardContent>
        <Typography component='h2'>{todoList.title}</Typography>
        <div
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
            color={saveChrome.tone === 'error' ? 'error' : 'text.secondary'}
            aria-live='polite'
          >
            {saveChrome.message}
          </Typography>
          {saveChrome.showRetry && (
            <Button
              type='button'
              size='small'
              color='primary'
              onClick={onRetry}
              aria-label='Retry saving todo list'
            >
              Retry
            </Button>
          )}
        </div>
        <div
          style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              onComposerCommit?.()
              onBlurSave?.()
            }
          }}
        >
          <div
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                onComposerCommit?.()
              }
            }}
          >
            <TodoItem
              variant='composer'
              todo={{
                id: 'composer',
                text: composerText,
                completed: false,
                dueDate: null,
              }}
              index={-1}
              onChange={(patch) => {
                if (Object.prototype.hasOwnProperty.call(patch, 'text')) {
                  onComposerChange?.(patch.text)
                }
              }}
            />
          </div>
          {todos.map((todo, index) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              index={index}
              onChange={(patch) => onTodoPatch?.(todo.id, patch)}
              onRemove={() => onTodoRemove?.(todo.id)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
