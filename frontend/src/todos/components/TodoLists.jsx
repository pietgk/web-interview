import React, { Fragment, useCallback, useState, useEffect } from 'react'
import {
  Card,
  CardContent,
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Typography,
  CircularProgress,
} from '@mui/material'
import ReceiptIcon from '@mui/icons-material/Receipt'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { TodoListForm } from './TodoListForm'
import { fetchTodoLists, saveTodoList as persistTodoList } from '../../api/todoLists'
import { isListCompleted } from '../todoModel'

export const TodoLists = ({ style }) => {
  const [todoLists, setTodoLists] = useState({})
  const [activeList, setActiveList] = useState()
  const [loadState, setLoadState] = useState('loading')
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoadState('loading')
    fetchTodoLists()
      .then((lists) => {
        if (cancelled) return
        setTodoLists(lists)
        setLoadState('ready')
      })
      .catch((error) => {
        if (cancelled) return
        setLoadError(error.message || 'Failed to load todo lists')
        setLoadState('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const saveTodoList = useCallback(async (id, { todos }) => {
    const saved = await persistTodoList(id, { todos })
    setTodoLists((current) => ({
      ...current,
      [id]: { ...current[id], todos: saved.todos },
    }))
    return saved
  }, [])

  if (loadState === 'loading') {
    return (
      <div style={{ ...style, display: 'flex', justifyContent: 'center', padding: '2rem' }}>
        <CircularProgress aria-label='Loading todo lists' />
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <Typography color='error' style={style}>
        {loadError}
      </Typography>
    )
  }

  if (!Object.keys(todoLists).length) {
    return (
      <Typography style={style} color='text.secondary'>
        No todo lists yet.
      </Typography>
    )
  }

  return (
    <Fragment>
      <Card style={style}>
        <CardContent>
          <Typography component='h2'>My Todo Lists</Typography>
          <List>
            {Object.keys(todoLists).map((key) => {
              const list = todoLists[key]
              const completed = isListCompleted(list.todos)
              return (
                <ListItemButton key={key} onClick={() => setActiveList(key)}>
                  <ListItemIcon>
                    {completed ? (
                      <CheckCircleIcon color='success' aria-label={`${list.title} completed`} />
                    ) : (
                      <ReceiptIcon />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={list.title}
                    secondary={completed ? 'All todos completed' : null}
                  />
                </ListItemButton>
              )
            })}
          </List>
        </CardContent>
      </Card>
      {todoLists[activeList] && (
        <TodoListForm
          key={activeList}
          todoList={todoLists[activeList]}
          saveTodoList={saveTodoList}
        />
      )}
    </Fragment>
  )
}
