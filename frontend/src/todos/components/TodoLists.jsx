import React, {
  Fragment,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react'
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
import { getDueStatus } from '../todoModel'
import { createTodoListCommands } from '../todoListCommands'
import {
  selectListAfterDeletion,
  selectTodoListsScreen,
} from '../todoListsScreenView'
import { todoListsUiReducer } from '../todoListsUiState'

const DeleteTodoListDialog = lazy(() => import('./DeleteTodoListDialog'))

/** @typedef {import('@web-interview/todos/types').Todo} Todo */
/** @typedef {import('@web-interview/todos/types').TodoList} TodoList */
/** @typedef {import('../useTodoLists').TodoRuntime} TodoRuntime */

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
  const commands = useMemo(() => createTodoListCommands(client), [client])
  const [uiState, dispatch] = useReducer(todoListsUiReducer, {
    mode: 'browsing',
    activeListId: null,
  })
  const titleInputRef = useRef(/** @type {HTMLInputElement | null} */ (null))
  const addButtonRef = useRef(/** @type {HTMLButtonElement | null} */ (null))
  const initialSelectionMade = useRef(false)
  const focusAddWhenEmpty = useRef(false)

  const { summaries, drafting, activeList, confirmingList, hydrated } = useMemo(
    () => selectTodoListsScreen(readModel, uiState, status),
    [readModel, uiState, status]
  )

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

  /**
   * One datom deletes a Todo List holding any number of Todos: they stop
   * projecting because the Todo List named by their ids no longer exists.
   *
   * @param {TodoList} todoList
   */
  const removeList = (todoList) => {
    const nextListId = selectListAfterDeletion(
      summaries,
      uiState.activeListId,
      todoList.id
    )
    focusAddWhenEmpty.current = summaries.length === 1
    commands.deleteList(todoList)
    dispatch({ type: 'CONFIRM_DELETE', nextListId })
  }

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
                if (drafting) {
                  titleInputRef.current?.focus()
                  return
                }
                dispatch({ type: 'ADD_LIST', reservedListId: commands.reserveListId() })
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
          todoList={activeList}
          commands={commands}
          draft={drafting}
          autoFocusTitle={drafting}
          titleFocusRef={titleInputRef}
          onMaterialize={(title) => {
            commands.renameList(activeList.id, title)
            dispatch({ type: 'MATERIALIZE', listId: activeList.id })
          }}
          onTitleChange={(title) => {
            if (!readModel[activeList.id]) return
            commands.renameList(activeList.id, title)
          }}
          onCancelDraft={() => dispatch({ type: 'ESCAPE_DRAFT' })}
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
