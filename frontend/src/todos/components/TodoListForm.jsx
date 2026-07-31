import React, { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardActions, Button, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { TodoItem } from './TodoItem'
import { createTodo, removeTodoAt, updateTodoAt } from '../todoModel'
import { useDebouncedValue } from '../useDebouncedValue'

export const TodoListForm = ({ todoList, saveTodoList }) => {
  const [todos, setTodos] = useState(todoList.todos)
  const [saveState, setSaveState] = useState('idle')
  const [saveError, setSaveError] = useState(null)
  const debouncedTodos = useDebouncedValue(todos, 400)
  const skipNextSave = useRef(true)
  const latestTodos = useRef(todos)
  latestTodos.current = todos

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false
      return
    }

    let cancelled = false
    setSaveState('saving')
    setSaveError(null)

    saveTodoList(todoList.id, { todos: debouncedTodos })
      .then(() => {
        if (cancelled) return
        // Only show saved if nothing newer is pending locally
        if (latestTodos.current === debouncedTodos) {
          setSaveState('saved')
        }
      })
      .catch((error) => {
        if (cancelled) return
        setSaveState('error')
        setSaveError(error.message || 'Failed to save')
      })

    return () => {
      cancelled = true
    }
  }, [debouncedTodos, saveTodoList, todoList.id])

  return (
    <Card sx={{ margin: '0 1rem' }}>
      <CardContent>
        <Typography component='h2'>{todoList.title}</Typography>
        <Typography
          variant='body2'
          color={saveState === 'error' ? 'error' : 'text.secondary'}
          sx={{ marginBottom: '0.5rem', minHeight: '1.25rem' }}
          aria-live='polite'
        >
          {saveState === 'saving' && 'Saving…'}
          {saveState === 'saved' && 'All changes saved'}
          {saveState === 'error' && `Save failed: ${saveError}`}
        </Typography>
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
          {todos.map((todo, index) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              index={index}
              onChange={(patch) => setTodos(updateTodoAt(todos, index, patch))}
              onRemove={() => setTodos(removeTodoAt(todos, index))}
            />
          ))}
          <CardActions>
            <Button
              type='button'
              color='primary'
              onClick={() => setTodos([...todos, createTodo()])}
            >
              Add Todo <AddIcon />
            </Button>
          </CardActions>
        </div>
      </CardContent>
    </Card>
  )
}
