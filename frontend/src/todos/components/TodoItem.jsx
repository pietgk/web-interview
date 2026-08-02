import React from 'react'
import {
  TextField,
  IconButton,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import { CompletionField } from './CompletionField'
import { DueIn } from './DueIn'
import { TodoRow } from './TodoRow'

const todoLabel = (todo) => {
  const text = String(todo?.text ?? '').trim()
  return text || 'untitled'
}

/**
 * @param {{
 *   todo: {id: string, text: string, completed: boolean, dueDate: string | null},
 *   onChange: (patch: object) => void,
 *   onRemove: () => void,
 *   now?: Date
 * }} props
 */
export const TodoItem = ({ todo, onChange, onRemove, now }) => {
  const label = todoLabel(todo)

  return (
    <TodoRow ariaLabel={`Todo: ${label}`}>
      <CompletionField
        completed={todo.completed}
        onChange={(completed) => onChange({ completed })}
        todoLabel={label}
      />
      <DueIn
        dueDate={todo.dueDate}
        completed={todo.completed}
        onChange={(dueDate) => onChange({ dueDate })}
        todoLabel={label}
        now={now}
      />
      <TextField
        sx={{ flexGrow: 1, minWidth: '12rem' }}
        label='What to do?'
        value={todo.text}
        onChange={(event) => onChange({ text: event.target.value })}
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
