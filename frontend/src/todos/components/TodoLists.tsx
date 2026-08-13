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
import type { SxProps } from '@mui/material'
import type { Theme } from '@mui/material/styles'
import AddIcon from '@mui/icons-material/Add'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import DeleteIcon from '@mui/icons-material/Delete'
import ReceiptIcon from '@mui/icons-material/Receipt'
import { TodoListForm } from './TodoListForm.tsx'
import { getDueStatus } from '../todoModel.ts'
import { createTodoListCommands } from '../todoListCommands.ts'
import {
  selectListAfterDeletion,
  selectTodoListsScreen,
} from '../todoListsScreenView.ts'
import {
  initialTodoListsUiState,
  todoListsUiReducer,
} from '../todoListsUiState.ts'
import type { TodoList } from '@web-interview/todos/types'
import type { TodoListSummary } from '@web-interview/todos/selectors'
import type { TodoRuntime } from '../useTodoLists.ts'

const DeleteTodoListDialog = lazy(() => import('./DeleteTodoListDialog.tsx'))

const ListRecap = ({ summary, today }: {summary: TodoListSummary, today: string | null}) => {
  const completion = summary.totalCount === 0
    ? 'No todos yet'
    : `${summary.completedCount} of ${summary.totalCount} completed`
  const due = today ? getDueStatus(summary.nextDueDate, { today }) : null
  return (
    <Box component='span' sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {completion}
      {due && (
        <>
          {' · '}
          <Box component='span' sx={{
            color: due.kind === 'overdue' ? 'error.main' : 'inherit'
          }}>
            {due.label}
          </Box>
        </>
      )}
    </Box>
  )
}

const TodoListRow = ({ todoList, summary, today, selected, onSelect, onDelete }: {todoList: TodoList, summary: TodoListSummary, today: string | null, selected: boolean, onSelect: () => void, onDelete: () => void}) => (
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
      sx={(theme) => ({ paddingRight: theme.todos.listRow.actionClearance })}
    >
      <ListItemIcon>
        {summary.completed ? (
          <CheckCircleIcon color='success' aria-hidden />
        ) : (
          <ReceiptIcon aria-hidden />
        )}
      </ListItemIcon>
      <ListItemText primary={summary.title} secondary={<ListRecap summary={summary} today={today} />} />
    </ListItemButton>
  </ListItem>
)

export const TodoLists = ({ runtime, sx }: {runtime: TodoRuntime, sx?: SxProps<Theme>}) => {
  const { client, readModel, status, today } = runtime
  const commands = useMemo(() => createTodoListCommands(client), [client])
  const [uiState, dispatch] = useReducer(todoListsUiReducer, initialTodoListsUiState)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const addButtonRef = useRef<HTMLButtonElement | null>(null)
  const focusAddWhenEmpty = useRef(false)

  const { summaries, drafting, activeList, confirmingList, hydrated } = useMemo(
    () => selectTodoListsScreen(readModel, uiState, status),
    [readModel, uiState, status]
  )

  // A different log means this client threw its world away, and a selection that
  // named a Todo List in the old one means nothing. Keying on the epoch is what
  // lets this run again rather than once per mount.
  useEffect(() => {
    dispatch({ type: 'UI_RESET' })
  }, [status.epoch])

  // The stream sends the compacted set before it sends server time, so a clock
  // means the Todo Lists are here. The reducer ignores this unless it is still
  // waiting, so it cannot override a choice the person already made.
  useEffect(() => {
    if (status.canEdit) dispatch({ type: 'LIST_HYDRATED', listId: summaries[0]?.id ?? null })
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
   */
  const removeList = (todoList: TodoList) => {
    const nextListId = selectListAfterDeletion(
      summaries,
      uiState.activeListId,
      todoList.id
    )
    focusAddWhenEmpty.current = summaries.length === 1
    commands.deleteList(todoList)
    dispatch({ type: 'DELETE_CONFIRMED', nextListId })
  }

  return (
    <Fragment>
      <Card sx={sx} component='section' aria-labelledby='todo-lists-heading'>
        <CardContent>
          <Typography id='todo-lists-heading' component='h2' variant='h6'>
            My Todo Lists
          </Typography>
          {summaries.length === 0 && status.canEdit && (
            <Typography
              sx={{
                color: 'text.secondary',
                marginTop: 1,
                '@media (prefers-contrast: more)': {
                  color: 'text.primary',
                },
              }}>
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
                  today={today}
                  selected={summary.id === uiState.activeListId}
                  onSelect={() => dispatch({ type: 'LIST_SELECTED', listId: summary.id })}
                  onDelete={() => {
                    if (todoList.todos.length === 0) removeList(todoList)
                    else dispatch({ type: 'DELETE_REQUESTED', targetListId: todoList.id })
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
                dispatch({ type: 'DRAFT_STARTED', reservedListId: commands.reserveListId() })
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
          today={today as string}
          draft={drafting}
          autoFocusTitle={drafting}
          titleFocusRef={titleInputRef}
          onMaterialize={(title) => {
            commands.materializeList(activeList.id, title)
            dispatch({ type: 'LIST_MATERIALIZED', listId: activeList.id })
          }}
          onTitleChange={(title) => {
            commands.renameList(activeList.id, title)
          }}
          onCancelDraft={() => dispatch({ type: 'DRAFT_ESCAPED' })}
        />
      )}

      {confirmingList && (
        <Suspense fallback={null}>
          <DeleteTodoListDialog
            todoList={confirmingList}
            onCancel={() => dispatch({ type: 'DELETE_CANCELLED' })}
            onConfirm={() => removeList(confirmingList)}
          />
        </Suspense>
      )}
    </Fragment>
  )
}
