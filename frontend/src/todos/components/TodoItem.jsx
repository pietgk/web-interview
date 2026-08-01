import React, { useId, useRef } from 'react'
import {
  TextField,
  Button,
  Typography,
  Checkbox,
  FormControlLabel,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import { getDueStatus } from '../todoModel'

const todoLabel = (todo) => {
  const text = String(todo?.text ?? '').trim()
  return text || 'untitled'
}

export const TodoItem = ({
  todo,
  onChange,
  onRemove,
  onSubmit,
  now,
  variant = 'todo',
}) => {
  const isComposer = variant === 'composer'
  const composerInputRef = useRef(null)
  const dueStatusId = useId()
  const label = todoLabel(todo)
  const dueStatus = isComposer
    ? null
    : getDueStatus(todo.dueDate, {
        completed: todo.completed,
        now,
      })

  const submitComposer = () => {
    onSubmit?.()
    // Plus button steals focus; return to the ghost input for the next add.
    composerInputRef.current?.focus()
  }

  return (
    <div
      {...(isComposer
        ? {}
        : { role: 'group', 'aria-label': `Todo: ${label}` })}
      style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
    >
      {!isComposer && (
        <FormControlLabel
          control={
            <Checkbox
              checked={todo.completed}
              onChange={(event) => onChange({ completed: event.target.checked })}
              inputProps={{ 'aria-label': `Mark completed: ${label}` }}
            />
          }
          label='Done'
        />
      )}
      <TextField
        sx={{ flexGrow: 1, minWidth: '12rem', marginTop: '1rem' }}
        label={isComposer ? 'Add a todo' : 'What to do?'}
        value={todo.text}
        onChange={(event) => onChange({ text: event.target.value })}
        inputRef={isComposer ? composerInputRef : undefined}
        onKeyDown={
          isComposer
            ? (event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submitComposer()
                }
              }
            : undefined
        }
        inputProps={
          isComposer
            ? { 'aria-label': 'Add a todo' }
            : dueStatus
              ? { 'aria-describedby': dueStatusId }
              : undefined
        }
      />
      {isComposer ? (
        <Button
          sx={{ margin: '8px' }}
          size='small'
          color='secondary'
          onClick={submitComposer}
          aria-label='Add todo'
        >
          <AddIcon aria-hidden />
        </Button>
      ) : (
        <>
          <TextField
            sx={{ marginTop: '1rem', width: '11rem' }}
            label='Due date'
            type='date'
            value={todo.dueDate || ''}
            onChange={(event) => onChange({ dueDate: event.target.value || null })}
            InputLabelProps={{ shrink: true }}
            inputProps={{ 'aria-label': `Due date: ${label}` }}
          />
          {dueStatus && (
            <Typography
              id={dueStatusId}
              variant='body2'
              color={dueStatus.kind === 'overdue' ? 'error' : 'text.secondary'}
              sx={{ minWidth: '9rem' }}
            >
              {dueStatus.label}
            </Typography>
          )}
          <Button
            sx={{ margin: '8px' }}
            size='small'
            color='secondary'
            onClick={onRemove}
            aria-label={`Delete todo: ${label}`}
          >
            <DeleteIcon aria-hidden />
          </Button>
        </>
      )}
    </div>
  )
}
