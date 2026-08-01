import React, { Fragment } from 'react'
import {
  Card,
  CardContent,
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Typography,
  CircularProgress,
  Button,
} from '@mui/material'
import ReceiptIcon from '@mui/icons-material/Receipt'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { TodoListForm } from './TodoListForm'
import { useTodoLists } from '../useTodoLists'

export const TodoLists = ({ style }) => {
  const {
    loadState,
    loadError,
    lists,
    activeEntry,
    selectList,
    updateTodos,
    flushList,
    retrySave,
    reload,
  } = useTodoLists()

  if (loadState === 'loading') {
    return (
      <div style={{ ...style, display: 'flex', justifyContent: 'center', padding: '2rem' }}>
        <CircularProgress aria-label='Loading todo lists' />
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div style={style}>
        <Typography color='error' sx={{ marginBottom: '0.75rem' }}>
          {loadError}
        </Typography>
        <Button type='button' variant='outlined' onClick={reload}>
          Retry loading
        </Button>
      </div>
    )
  }

  if (!lists.length) {
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
            {lists.map((list) => (
              <ListItemButton key={list.id} onClick={() => selectList(list.id)}>
                <ListItemIcon>
                  {list.completed ? (
                    <CheckCircleIcon color='success' aria-label={`${list.title} completed`} />
                  ) : (
                    <ReceiptIcon />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={list.title}
                  secondary={list.completed ? 'All todos completed' : null}
                />
              </ListItemButton>
            ))}
          </List>
        </CardContent>
      </Card>
      {activeEntry && (
        <TodoListForm
          key={activeEntry.id}
          todoList={{
            id: activeEntry.id,
            title: activeEntry.title,
            todos: activeEntry.draft,
          }}
          saveStatus={activeEntry.status}
          saveError={activeEntry.error}
          onTodosChange={(todos) => updateTodos(activeEntry.id, todos)}
          onRetry={() => retrySave(activeEntry.id)}
          onBlurSave={() => flushList(activeEntry.id)}
        />
      )}
    </Fragment>
  )
}
