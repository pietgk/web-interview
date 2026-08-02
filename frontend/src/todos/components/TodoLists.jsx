import React, { Fragment, useEffect, useMemo, useState } from 'react'
import {
  createTodoTransaction,
  deleteTodoTransaction,
  newTodoId,
  patchTodoTransaction,
} from '@web-interview/todos/transactions'
import {
  selectListSaveChrome,
  selectListSummary,
} from '@web-interview/todos/selectors'
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
import { createTodo, isDematerializableTodo } from '../todoModel'

const listRecap = ({ completedCount, totalCount }) =>
  totalCount === 0
    ? 'No todos yet'
    : `${completedCount} of ${totalCount} completed`

const TodoListButton = ({ todoList, selected, onSelect }) => {
  const summary = selectListSummary(todoList)

  return (
    <ListItemButton
      selected={selected}
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
    >
      <ListItemIcon>
        {summary.completed ? (
          <CheckCircleIcon color='success' aria-hidden />
        ) : (
          <ReceiptIcon aria-hidden />
        )}
      </ListItemIcon>
      <ListItemText
        primary={summary.title}
        secondary={listRecap(summary)}
        secondaryTypographyProps={{ noWrap: true }}
      />
    </ListItemButton>
  )
}

const composerFor = (composers, listId) =>
  composers[listId] ?? { text: '', linkedId: null }

export const TodoLists = ({ style }) => {
  const { actor, clientId, snapshot } = useTodoLists()
  const [activeListId, setActiveListId] = useState(null)
  const [composers, setComposers] = useState({})
  const todoLists = useMemo(
    () => Object.values(snapshot.readModel),
    [snapshot.readModel]
  )
  const activeList = activeListId ? snapshot.readModel[activeListId] : null

  useEffect(() => {
    if (activeListId && !snapshot.readModel[activeListId]) setActiveListId(null)
  }, [activeListId, snapshot.readModel])

  const transact = (transaction) => {
    if (transaction) actor.send({ type: 'TRANSACT', transaction })
  }

  const sendToList = (todoList, event) => {
    const composer = composerFor(composers, todoList.id)
    const setComposer = (next) =>
      setComposers((current) => ({ ...current, [todoList.id]: next }))

    switch (event.type) {
      case 'COMPOSER_CHANGE': {
        const text = event.text ?? ''
        if (!composer.linkedId) {
          if (!text.trim()) {
            setComposer({ text, linkedId: null })
            return
          }
          const todo = createTodo({ id: newTodoId(), text })
          transact(
            createTodoTransaction({
              basis: snapshot.basis,
              clientId,
              listId: todoList.id,
              todo,
              order: -Date.now(),
            })
          )
          setComposer({ text, linkedId: todo.id })
          return
        }

        const todo = todoList.todos.find((entry) => entry.id === composer.linkedId)
        if (!todo) {
          setComposer({ text, linkedId: null })
          return
        }
        const nextTodo = { ...todo, text }
        if (isDematerializableTodo(nextTodo)) {
          transact(
            deleteTodoTransaction({
              basis: snapshot.basis,
              clientId,
              listId: todoList.id,
              todo,
            })
          )
          setComposer({ text: '', linkedId: null })
          return
        }
        transact(
          patchTodoTransaction({
            basis: snapshot.basis,
            clientId,
            listId: todoList.id,
            todo,
            patch: { text },
          })
        )
        setComposer({ text, linkedId: composer.linkedId })
        return
      }
      case 'COMPOSER_COMMIT':
      case 'COMPOSER_SUBMIT':
        setComposer({ text: '', linkedId: null })
        return
      case 'TODO_PATCH': {
        const todo = todoList.todos.find((entry) => entry.id === event.id)
        if (!todo) return
        transact(
          patchTodoTransaction({
            basis: snapshot.basis,
            clientId,
            listId: todoList.id,
            todo,
            patch: event.patch,
          })
        )
        return
      }
      case 'TODO_REMOVE': {
        const todo = todoList.todos.find((entry) => entry.id === event.id)
        if (!todo) return
        transact(
          deleteTodoTransaction({
            basis: snapshot.basis,
            clientId,
            listId: todoList.id,
            todo,
          })
        )
        return
      }
      case 'RETRY':
        actor.send({ type: 'RETRY_PERSISTENCE' })
        actor.send({ type: 'RETRY_SYNC' })
        return
      case 'FLUSH':
        actor.send({ type: 'SYNC' })
        return
      default:
        throw new Error(`Unknown todo-list UI event: ${event.type}`)
    }
  }

  if (snapshot.status === 'idle' || snapshot.status === 'loading') {
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

  if (snapshot.status === 'error') {
    return (
      <div style={style} role='alert'>
        <Typography color='error' sx={{ marginBottom: '0.75rem' }}>
          {snapshot.error}
        </Typography>
        <Button type='button' variant='outlined' onClick={() => actor.send({ type: 'RELOAD' })}>
          Retry loading
        </Button>
      </div>
    )
  }

  if (!todoLists.length) {
    return (
      <Typography style={style} color='text.secondary' role='status'>
        No todo lists yet.
      </Typography>
    )
  }

  const composer = activeList
    ? composerFor(composers, activeList.id)
    : { text: '', linkedId: null }
  const visibleTodos = activeList
    ? activeList.todos.filter((todo) => todo.id !== composer.linkedId)
    : []

  return (
    <Fragment>
      <Card style={style} component='section' aria-labelledby='todo-lists-heading'>
        <CardContent>
          <Typography id='todo-lists-heading' component='h2'>
            My Todo Lists
          </Typography>
          <List aria-label='Todo lists'>
            {todoLists.map((todoList) => (
              <TodoListButton
                key={todoList.id}
                todoList={todoList}
                selected={todoList.id === activeListId}
                onSelect={() => setActiveListId(todoList.id)}
              />
            ))}
          </List>
        </CardContent>
      </Card>
      {activeList && (
        <TodoListForm
          key={activeList.id}
          todoList={{ ...activeList, todos: visibleTodos }}
          composerText={composer.text}
          saveChrome={selectListSaveChrome(snapshot, activeList.id)}
          send={(event) => sendToList(activeList, event)}
        />
      )}
    </Fragment>
  )
}
