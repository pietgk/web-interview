import React, {
  Fragment,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { ATTRIBUTE } from '@web-interview/todos/datom'
import { CONNECTION, TEXT_SETTLE_MS } from '@web-interview/todos/protocol'
import { selectTodoListSummaries } from '@web-interview/todos/selectors'
import {
  Box,
  Card,
  CardContent,
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
import { getDueStatus, isDematerializableTodo } from '../todoModel'
import { TODO_UI_EVENT } from '../todoUiProtocol'
import { todoListsUiReducer } from '../todoListsUiState'

const DeleteTodoListDialog = lazy(() => import('./DeleteTodoListDialog'))

/** @typedef {import('@web-interview/todos/types').Todo} Todo */
/** @typedef {import('@web-interview/todos/types').TodoList} TodoList */
/** @typedef {import('../todoUiProtocol').TodoUiEvent} TodoUiEvent */
/** @typedef {import('../useTodoLists').TodoRuntime} TodoRuntime */
/** @typedef {{text: string, linkedId: string | null}} ComposerState */

const emptyComposer = /** @type {ComposerState} */ ({ text: '', linkedId: null })

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

/** @param {{runtime: TodoRuntime, style?: React.CSSProperties}} props */
export const TodoLists = ({ runtime, style }) => {
  const { client, readModel, status } = runtime
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

  // The composer's in-flight text is ephemeral React state that settles into one
  // datom. These refs let a settle timer read the newest text and read model
  // without depending on when React last rendered.
  const composersRef = useRef(composers)
  const readModelRef = useRef(readModel)
  readModelRef.current = readModel
  const settleTimers = useRef(
    /** @type {Map<string, ReturnType<typeof setTimeout>>} */ (new Map())
  )

  const summaries = useMemo(() => selectTodoListSummaries(readModel), [readModel])
  // The stream sends the compacted set before it sends server time, so `canEdit`
  // also means "the Todo Lists have arrived".
  const hydrated = status.canEdit || status.connection !== CONNECTION.CONNECTING

  useEffect(() => {
    if (status.canEdit && !initialSelectionMade.current) {
      initialSelectionMade.current = true
      dispatch({ type: 'SET_ACTIVE', listId: summaries[0]?.id ?? null })
    }
  }, [status.canEdit, summaries])

  useEffect(() => {
    if (focusAddWhenEmpty.current && summaries.length === 0) {
      focusAddWhenEmpty.current = false
      addButtonRef.current?.focus()
    }
  }, [summaries.length])

  const timers = settleTimers.current
  useEffect(() => () => {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
  }, [timers])

  /** @param {string} listId */
  const composerFor = (listId) => composersRef.current[listId] ?? emptyComposer

  /** @param {string} listId @param {ComposerState} next */
  const setComposer = (listId, next) => {
    composersRef.current = { ...composersRef.current, [listId]: next }
    setComposers(composersRef.current)
  }

  /** @param {string} listId */
  const clearComposerTimer = (listId) => {
    const timer = settleTimers.current.get(listId)
    if (timer) clearTimeout(timer)
    settleTimers.current.delete(listId)
  }

  /**
   * The ghost composer materializes its Todo on the first settle rather than on
   * the first character, and dematerializes it when the settled text is blank.
   *
   * @param {string} listId
   */
  const settleComposer = (listId) => {
    clearComposerTimer(listId)
    const todoList = readModelRef.current[listId]
    const { text, linkedId } = composerFor(listId)

    if (!linkedId) {
      if (!todoList || isDematerializableTodo({ text })) return
      const id = client.newTodoId(listId)
      if (client.assert(id, ATTRIBUTE.TEXT, text)) setComposer(listId, { text, linkedId: id })
      return
    }

    const todo = todoList?.todos.find((entry) => entry.id === linkedId)
    if (!todo) {
      setComposer(listId, { text, linkedId: null })
      return
    }
    if (todo.text === text) return
    if (isDematerializableTodo({ text })) {
      client.retract(todo.id, ATTRIBUTE.TEXT, todo.text)
      setComposer(listId, emptyComposer)
      return
    }
    client.assert(todo.id, ATTRIBUTE.TEXT, text)
  }

  const settleComposerRef = useRef(settleComposer)
  settleComposerRef.current = settleComposer

  /** @param {string} listId */
  const scheduleComposerSettle = (listId) => {
    clearComposerTimer(listId)
    settleTimers.current.set(
      listId,
      setTimeout(() => {
        settleTimers.current.delete(listId)
        settleComposerRef.current(listId)
      }, TEXT_SETTLE_MS)
    )
  }

  /** @type {TodoList | null} */
  const activeList = uiState.mode === 'drafting'
    ? { id: uiState.reservedListId, title: '', todos: [] }
    : uiState.activeListId
      ? readModel[uiState.activeListId] ?? null
      : null

  /** @param {TodoList} todoList @param {TodoUiEvent} event */
  const sendToList = (todoList, event) => {
    switch (event.type) {
      case TODO_UI_EVENT.COMPOSER_CHANGE: {
        setComposer(todoList.id, {
          ...composerFor(todoList.id),
          text: event.text ?? '',
        })
        scheduleComposerSettle(todoList.id)
        return
      }
      case TODO_UI_EVENT.COMPOSER_COMMIT:
      case TODO_UI_EVENT.COMPOSER_SUBMIT:
        settleComposer(todoList.id)
        setComposer(todoList.id, emptyComposer)
        return
      case TODO_UI_EVENT.TODO_PATCH: {
        const todo = todoList.todos.find((entry) => entry.id === event.id)
        if (!todo) return
        if ('text' in event.patch) {
          client.assert(todo.id, ATTRIBUTE.TEXT, /** @type {string} */ (event.patch.text))
        }
        if ('completed' in event.patch) {
          client.assert(
            todo.id,
            ATTRIBUTE.COMPLETED,
            /** @type {boolean} */ (event.patch.completed)
          )
        }
        if ('dueDate' in event.patch) {
          if (event.patch.dueDate) client.assert(todo.id, ATTRIBUTE.DUE_DATE, event.patch.dueDate)
          else if (todo.dueDate) client.retract(todo.id, ATTRIBUTE.DUE_DATE, todo.dueDate)
        }
        return
      }
      case TODO_UI_EVENT.TODO_REMOVE: {
        const todo = todoList.todos.find((entry) => entry.id === event.id)
        if (!todo) return
        client.retract(todo.id, ATTRIBUTE.TEXT, todo.text)
        return
      }
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

  /**
   * One datom deletes a Todo List holding any number of Todos: they stop
   * projecting because the Todo List named by their ids no longer exists.
   *
   * @param {TodoList} todoList
   */
  const removeList = (todoList) => {
    const nextListId = nearestAfterDeletion(todoList)
    focusAddWhenEmpty.current = summaries.length === 1
    clearComposerTimer(todoList.id)
    setComposer(todoList.id, emptyComposer)
    client.retract(todoList.id, ATTRIBUTE.TITLE, todoList.title)
    dispatch({ type: 'CONFIRM_DELETE', nextListId })
  }

  const confirmingList = uiState.mode === 'confirmingDelete'
    ? readModel[uiState.targetListId] ?? null
    : null
  const composer = activeList ? composerFor(activeList.id) : emptyComposer
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
          {summaries.length === 0 && status.canEdit && (
            <Typography color='text.secondary' sx={{ marginTop: 1 }}>
              No Todo Lists yet.
            </Typography>
          )}
          <List aria-label='Todo lists'>
            {summaries.map((summary) => {
              const todoList = readModel[summary.id]
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
          {/* Held back until the stream has spoken once, so the control appears
              in its final position instead of shifting under the Todo Lists. */}
          {hydrated && (
            <IconButton
              ref={addButtonRef}
              color='secondary'
              aria-label='Add Todo List'
              disabled={!status.canEdit}
              onClick={() => {
                if (uiState.mode === 'drafting') {
                  titleInputRef.current?.focus()
                  return
                }
                dispatch({ type: 'ADD_LIST', reservedListId: client.newListId() })
              }}
              sx={{ marginLeft: 1 }}
            >
              <AddIcon aria-hidden />
            </IconButton>
          )}
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
            client.assert(activeList.id, ATTRIBUTE.TITLE, title)
            dispatch({ type: 'MATERIALIZE', listId: activeList.id })
          }}
          onTitleChange={(title) => {
            if (!readModel[activeList.id]) return
            client.assert(activeList.id, ATTRIBUTE.TITLE, title)
          }}
          onCancelDraft={() => dispatch({ type: 'ESCAPE_DRAFT' })}
          send={(event) => sendToList(activeList, event)}
        />
      )}

      {confirmingList && (
        <Suspense fallback={null}>
          <DeleteTodoListDialog
            todoList={confirmingList}
            onCancel={() => dispatch({ type: 'CANCEL_DELETE' })}
            onConfirm={() => removeList(confirmingList)}
          />
        </Suspense>
      )}
    </Fragment>
  )
}
