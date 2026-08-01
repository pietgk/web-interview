import React, { Fragment } from 'react'
import { shallowEqual, useSelector } from '@xstate/react'
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
import {
  selectListSummary,
  selectTodoListView,
} from '../todoListMachine'

const listRecap = ({ completedCount, totalCount }) =>
  totalCount === 0
    ? 'No todos yet'
    : `${completedCount} of ${totalCount} completed`

const TodoListButton = ({ actorRef, selected, onSelect }) => {
  const list = useSelector(actorRef, selectListSummary, shallowEqual)

  return (
    <ListItemButton
      selected={selected}
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
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
        secondary={listRecap(list)}
        secondaryTypographyProps={{ noWrap: true }}
      />
    </ListItemButton>
  )
}

const ActiveTodoList = ({ actorRef }) => {
  const activeEntry = useSelector(actorRef, selectTodoListView, shallowEqual)

  return (
    <TodoListForm
      todoList={{
        id: activeEntry.id,
        title: activeEntry.title,
        todos: activeEntry.draft,
      }}
      composerText={activeEntry.composerText}
      saveChrome={activeEntry.saveChrome}
      send={actorRef.send}
    />
  )
}

export const TodoLists = ({ style }) => {
  const {
    loadState,
    loadError,
    lists,
    activeListId,
    activeListRef,
    send,
  } = useTodoLists()

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

  return (
    <Fragment>
      <Card style={style} component='section' aria-labelledby='todo-lists-heading'>
        <CardContent>
          <Typography id='todo-lists-heading' component='h2'>
            My Todo Lists
          </Typography>
          <List aria-label='Todo lists'>
            {lists.map(({ id, actorRef }) => {
              const isActive = id === activeListId
              return (
                <TodoListButton
                  key={id}
                  actorRef={actorRef}
                  selected={isActive}
                  onSelect={() => send({ type: 'SELECT_LIST', id })}
                />
              )
            })}
          </List>
        </CardContent>
      </Card>
      {activeListRef && (
        <ActiveTodoList key={activeListId} actorRef={activeListRef} />
      )}
    </Fragment>
  )
}
