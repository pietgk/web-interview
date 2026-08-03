import React, { Fragment, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  createTodoAtTopTransaction,
  createTodoListAtBottomTransaction,
  deleteTodoListTransaction,
  deleteTodoTransaction,
  newTodoId,
  newTodoListId,
  patchTodoListTitleTransaction,
  patchTodoTransaction,
} from '@web-interview/todos/transactions'
import { ACTOR_EVENT, ACTOR_STATUS } from '@web-interview/todos/protocol'
import { selectTodoListSummaries } from '@web-interview/todos/selectors'
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import DeleteIcon from '@mui/icons-material/Delete'
import ReceiptIcon from '@mui/icons-material/Receipt'
import { TodoListForm } from './TodoListForm'
import { createTodo, getDueStatus, isDematerializableTodo } from '../todoModel'
import { TODO_UI_EVENT } from '../todoUiProtocol'
import { todoListsUiReducer } from '../todoListsUiState'

/** @typedef {import('@web-interview/todos/types').TodoList} TodoList */
/** @typedef {import('@web-interview/todos/types').Transaction} Transaction */
/** @typedef {import('../todoUiProtocol').TodoUiEvent} TodoUiEvent */
/** @typedef {{text: string, linkedId: string | null}} ComposerState */
/** @typedef {{actor: import('@web-interview/todos/actor').TodoListActor, clientId: string, snapshot: import('@web-interview/todos/types').TodoListSnapshot}} TodoRuntime */

/** @param {import('@web-interview/todos/selectors').TodoListSummary} summary */
const ListRecap = (summary) => {
  const completion = summary.totalCount === 0
    ? 'No todos yet'
    : `${summary.completedCount} of ${summary.totalCount} completed`
  const due = getDueStatus(summary.nextDueDate)
  return (
    <Box component='span' sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {completion}
      {due && (
        <>
          {' · '}
          <Box component='span' color={due.kind === 'overdue' ? 'error.main' : 'inherit'}>
            {due.label}
          </Box>
        </>
      )}
    </Box>
  )
}

/** @param {{todoList: TodoList, summary: import('@web-interview/todos/selectors').TodoListSummary, selected: boolean, onSelect: () => void, onDelete: () => void}} props */
const TodoListRow = ({ todoList, summary, selected, onSelect, onDelete }) => (
  <ListItem
    disablePadding
    secondaryAction={
      <IconButton
        color='secondary'
        onClick={onDelete}
        aria-label={`Delete Todo List: ${todoList.title}`}
      >
        <DeleteIcon aria-hidden />
      </IconButton>
    }
  >
    <ListItemButton
      selected={selected}
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      sx={{ paddingRight: 7 }}
    >
      <ListItemIcon>
        {summary.completed ? (
          <CheckCircleIcon color='success' aria-hidden />
        ) : (
          <ReceiptIcon aria-hidden />
        )}
      </ListItemIcon>
      <ListItemText primary={summary.title} secondary={<ListRecap {...summary} />} />
    </ListItemButton>
  </ListItem>
)

/** @param {Record<string, ComposerState>} composers @param {string} listId */
const composerFor = (composers, listId) =>
  composers[listId] ?? { text: '', linkedId: null }

/** @param {{runtime: TodoRuntime, style?: React.CSSProperties}} props */
export const TodoLists = ({ runtime, style }) => {
  const { actor, clientId, snapshot } = runtime
  const [uiState, dispatch] = useReducer(todoListsUiReducer, {
    mode: 'browsing',
    activeListId: null,
  })
  const [composers, setComposers] = useState(
    /** @type {Record<string, ComposerState>} */ ({})
  )
  const titleInputRef = useRef(/** @type {HTMLInputElement | null} */ (null))
  const addButtonRef = useRef(/** @type {HTMLButtonElement | null} */ (null))
  const initialSelectionMade = useRef(false)
  const focusAddWhenEmpty = useRef(false)
  const summaries = useMemo(
    () => selectTodoListSummaries(snapshot.readModel),
    [snapshot.readModel]
  )

  useEffect(() => {
    if (
      snapshot.status === ACTOR_STATUS.READY &&
      !initialSelectionMade.current
    ) {
      initialSelectionMade.current = true
      dispatch({ type: 'SET_ACTIVE', listId: summaries[0]?.id ?? null })
    }
  }, [snapshot.status, summaries])

  useEffect(() => {
    if (focusAddWhenEmpty.current && summaries.length === 0) {
      focusAddWhenEmpty.current = false
      addButtonRef.current?.focus()
    }
  }, [summaries.length])

  /** @type {TodoList | null} */
  const activeList = uiState.mode === 'drafting'
    ? { id: uiState.reservedListId, title: '', todos: [] }
    : uiState.activeListId
      ? snapshot.readModel[uiState.activeListId] ?? null
      : null

  /** @param {Transaction | null} transaction */
  const transact = (transaction) => {
    if (transaction) actor.send({ type: ACTOR_EVENT.TRANSACT, transaction })
  }

  /** @param {TodoList} todoList @param {TodoUiEvent} event */
  const sendToList = (todoList, event) => {
    const composer = composerFor(composers, todoList.id)
    /** @param {ComposerState} next */
    const setComposer = (next) =>
      setComposers((current) => ({ ...current, [todoList.id]: next }))

    switch (event.type) {
      case TODO_UI_EVENT.COMPOSER_CHANGE: {
        const text = event.text ?? ''
        if (!composer.linkedId) {
          if (!text.trim()) {
            setComposer({ text, linkedId: null })
            return
          }
          const todo = createTodo({ id: newTodoId(), text })
          transact(createTodoAtTopTransaction({
            basis: snapshot.basis,
            clientId,
            listId: todoList.id,
            todo,
          }))
          setComposer({ text, linkedId: todo.id })
          return
        }
        const todo = todoList.todos.find((entry) => entry.id === composer.linkedId)
        if (!todo) {
          setComposer({ text, linkedId: null })
          return
        }
        if (isDematerializableTodo({ ...todo, text })) {
          transact(deleteTodoTransaction({
            basis: snapshot.basis,
            clientId,
            listId: todoList.id,
            todo,
          }))
          setComposer({ text: '', linkedId: null })
          return
        }
        transact(patchTodoTransaction({
          basis: snapshot.basis,
          clientId,
          listId: todoList.id,
          todo,
          patch: { text },
        }))
        setComposer({ text, linkedId: composer.linkedId })
        return
      }
      case TODO_UI_EVENT.COMPOSER_COMMIT:
      case TODO_UI_EVENT.COMPOSER_SUBMIT:
        setComposer({ text: '', linkedId: null })
        return
      case TODO_UI_EVENT.TODO_PATCH: {
        const todo = todoList.todos.find((entry) => entry.id === event.id)
        if (!todo) return
        transact(patchTodoTransaction({
          basis: snapshot.basis,
          clientId,
          listId: todoList.id,
          todo,
          patch: event.patch,
        }))
        return
      }
      case TODO_UI_EVENT.TODO_REMOVE: {
        const todo = todoList.todos.find((entry) => entry.id === event.id)
        if (!todo) return
        transact(deleteTodoTransaction({
          basis: snapshot.basis,
          clientId,
          listId: todoList.id,
          todo,
        }))
        return
      }
      case TODO_UI_EVENT.FLUSH:
        actor.send({ type: ACTOR_EVENT.SYNC })
        return
      default:
        return
    }
  }

  /** @param {TodoList} todoList */
  const nearestAfterDeletion = (todoList) => {
    if (uiState.activeListId !== todoList.id) return uiState.activeListId
    const index = summaries.findIndex((summary) => summary.id === todoList.id)
    return summaries[index + 1]?.id ?? summaries[index - 1]?.id ?? null
  }

  /** @param {TodoList} todoList */
  const removeList = (todoList) => {
    const nextListId = nearestAfterDeletion(todoList)
    focusAddWhenEmpty.current = summaries.length === 1
    transact(deleteTodoListTransaction({
      basis: snapshot.basis,
      clientId,
      todoList,
    }))
    dispatch({ type: 'CONFIRM_DELETE', nextListId })
  }

  const confirmingList = uiState.mode === 'confirmingDelete'
    ? snapshot.readModel[uiState.targetListId] ?? null
    : null
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
          <Typography id='todo-lists-heading' component='h2' variant='h6'>
            My Todo Lists
          </Typography>
          {summaries.length === 0 && snapshot.status === ACTOR_STATUS.READY && (
            <Typography color='text.secondary' sx={{ marginTop: 1 }}>
              No Todo Lists yet.
            </Typography>
          )}
          <List aria-label='Todo lists'>
            {summaries.map((summary) => {
              const todoList = snapshot.readModel[summary.id]
              return (
                <TodoListRow
                  key={summary.id}
                  todoList={todoList}
                  summary={summary}
                  selected={summary.id === uiState.activeListId}
                  onSelect={() => dispatch({ type: 'SELECT_LIST', listId: summary.id })}
                  onDelete={() => {
                    if (todoList.todos.length === 0) removeList(todoList)
                    else dispatch({ type: 'REQUEST_DELETE', targetListId: todoList.id })
                  }}
                />
              )
            })}
          </List>
          <IconButton
            ref={addButtonRef}
            color='secondary'
            aria-label='Add Todo List'
            disabled={snapshot.status !== ACTOR_STATUS.READY}
            onClick={() => {
              if (uiState.mode === 'drafting') {
                titleInputRef.current?.focus()
                return
              }
              dispatch({ type: 'ADD_LIST', reservedListId: newTodoListId() })
            }}
            sx={{ marginLeft: 1 }}
          >
            <AddIcon aria-hidden />
          </IconButton>
        </CardContent>
      </Card>

      {activeList && (
        <TodoListForm
          key={activeList.id}
          todoList={{ ...activeList, todos: visibleTodos }}
          composerText={composer.text}
          draft={uiState.mode === 'drafting'}
          autoFocusTitle={uiState.mode === 'drafting'}
          titleFocusRef={titleInputRef}
          onMaterialize={(title) => {
            transact(createTodoListAtBottomTransaction({
              basis: snapshot.basis,
              clientId,
              listId: activeList.id,
              title,
            }))
            dispatch({ type: 'MATERIALIZE', listId: activeList.id })
          }}
          onTitleChange={(title) => {
            const current = snapshot.readModel[activeList.id]
            if (!current) return
            transact(patchTodoListTitleTransaction({
              basis: snapshot.basis,
              clientId,
              todoList: current,
              title,
            }))
          }}
          onCancelDraft={() => dispatch({ type: 'ESCAPE_DRAFT' })}
          send={(event) => sendToList(activeList, event)}
        />
      )}

      <Dialog
        open={Boolean(confirmingList)}
        onClose={() => dispatch({ type: 'CANCEL_DELETE' })}
        aria-labelledby='delete-todo-list-title'
      >
        <DialogTitle id='delete-todo-list-title'>Delete {confirmingList?.title}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmingList
              ? `${confirmingList.todos.length} ${confirmingList.todos.length === 1 ? 'Todo' : 'Todos'} will also disappear.`
              : ''}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => dispatch({ type: 'CANCEL_DELETE' })}>Cancel</Button>
          <Button color='error' onClick={() => confirmingList && removeList(confirmingList)}>
            Delete Todo List
          </Button>
        </DialogActions>
      </Dialog>
    </Fragment>
  )
}
