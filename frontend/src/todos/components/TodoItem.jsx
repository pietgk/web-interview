import React from 'react'
import {
  TextField,
  IconButton,
  Checkbox,
  FormControlLabel,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import { DueIn } from './DueIn'
import { TodoRow } from './TodoRow'

const todoLabel = (todo) => {
  const text = String(todo?.text ?? '').trim()
  return text || 'untitled'
}

export const TodoItem = ({ todo, onChange, onRemove, now }) => {
  const label = todoLabel(todo)

  return (
    <TodoRow ariaLabel={`Todo: ${label}`}>
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
      <TextField
        sx={{ flexGrow: 1, minWidth: '12rem' }}
        label='What to do?'
        value={todo.text}
        onChange={(event) => onChange({ text: event.target.value })}
      />
      <DueIn
        dueDate={todo.dueDate}
        completed={todo.completed}
        onChange={(dueDate) => onChange({ dueDate })}
        todoLabel={label}
        now={now}
      />
      <IconButton
        color='secondary'
        onClick={onRemove}
        aria-label={`Delete todo: ${label}`}
      >
        <DeleteIcon aria-hidden />
      </IconButton>
    </TodoRow>
  )
}
