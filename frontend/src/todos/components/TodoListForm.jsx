import React from 'react'
import { Card, CardContent, CardActions, Button, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { TodoItem } from './TodoItem'
import { createTodo, removeTodoAt, updateTodoAt } from '../todoModel'
import { SAVE_STATUS } from '../todoListsState'

export const TodoListForm = ({
  todoList,
  saveStatus = SAVE_STATUS.CLEAN,
  saveError = null,
  onTodosChange,
  onRetry,
  onBlurSave,
}) => {
  const todos = todoList.todos

  const statusMessage = (() => {
    if (saveStatus === SAVE_STATUS.SAVING) return 'Saving…'
    if (saveStatus === SAVE_STATUS.CLEAN) return 'All changes saved'
    if (saveStatus === SAVE_STATUS.DIRTY) return 'Unsaved changes'
    if (saveStatus === SAVE_STATUS.ERROR) return `Save failed: ${saveError}`
    return null
  })()

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
            color={saveStatus === SAVE_STATUS.ERROR ? 'error' : 'text.secondary'}
            aria-live='polite'
          >
            {statusMessage}
          </Typography>
          {saveStatus === SAVE_STATUS.ERROR && (
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
              onBlurSave?.()
            }
          }}
        >
          {todos.map((todo, index) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              index={index}
              onChange={(patch) =>
                onTodosChange(updateTodoAt(todos, index, patch))
              }
              onRemove={() => onTodosChange(removeTodoAt(todos, index))}
            />
          ))}
          <CardActions>
            <Button
              type='button'
              color='primary'
              onClick={() => onTodosChange([...todos, createTodo()])}
            >
              Add Todo <AddIcon />
            </Button>
          </CardActions>
        </div>
      </CardContent>
    </Card>
  )
}
