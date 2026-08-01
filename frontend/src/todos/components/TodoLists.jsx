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
  const { loadState, loadError, lists, activeEntry, send } = useTodoLists()

  if (loadState === 'loading') {
    return (
      <div
        style={{ ...style, display: 'flex', justifyContent: 'center', padding: '2rem' }}
        role='status'
        aria-label='Loading todo lists'
      >
        <CircularProgress aria-hidden />
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div style={style} role='alert'>
        <Typography color='error' sx={{ marginBottom: '0.75rem' }}>
          {loadError}
        </Typography>
        <Button type='button' variant='outlined' onClick={() => send({ type: 'RELOAD' })}>
          Retry loading
        </Button>
      </div>
    )
  }

  if (!lists.length) {
    return (
      <Typography style={style} color='text.secondary' role='status'>
        No todo lists yet.
      </Typography>
    )
  }

  const activeListId = activeEntry?.id ?? null

  return (
    <Fragment>
      <Card style={style} component='section' aria-labelledby='todo-lists-heading'>
        <CardContent>
          <Typography id='todo-lists-heading' component='h2'>
            My Todo Lists
          </Typography>
          <List aria-label='Todo lists'>
            {lists.map((list) => {
              const isActive = list.id === activeListId
              return (
                <ListItemButton
                  key={list.id}
                  selected={isActive}
                  aria-current={isActive ? 'true' : undefined}
                  onClick={() => send({ type: 'SELECT_LIST', id: list.id })}
                >
                  <ListItemIcon>
                    {list.completed ? (
                      <CheckCircleIcon color='success' aria-hidden />
                    ) : (
                      <ReceiptIcon aria-hidden />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={list.title}
                    secondary={list.completed ? 'All todos completed' : null}
                  />
                </ListItemButton>
              )
            })}
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
          composerText={activeEntry.composerText}
          saveChrome={activeEntry.saveChrome}
          send={send}
        />
      )}
    </Fragment>
  )
}
