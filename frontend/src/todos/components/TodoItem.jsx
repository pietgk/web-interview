import React from 'react'
import {
  TextField,
  IconButton,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import { TODO_TEXT_MAX_LENGTH } from '@web-interview/todos/protocol'
import { CompletionField } from './CompletionField'
import { DueIn } from './DueIn'
import { TodoRow } from './TodoRow'
import { useSettledText } from '../useSettledText'

/** @typedef {import('@web-interview/todos/types').Todo} Todo */
/** @typedef {Partial<Pick<Todo, 'text' | 'completed' | 'dueDate'>>} TodoPatch */

/** @param {Todo} todo */
const todoLabel = (todo) => {
  const text = String(todo?.text ?? '').trim()
  return text || 'untitled'
}

/**
 * @param {{
 *   todo: Todo,
 *   onChange: (patch: TodoPatch) => void,
 *   onRemove: () => void,
 *   today: string
 * }} props
 */
export const TodoItem = ({ todo, onChange, onRemove, today }) => {
  const label = todoLabel(todo)
  const { text, change, settle } = useSettledText(todo.text, (next) =>
    onChange({ text: next })
  )

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
        today={today}
      />
      <TextField
        sx={{ flexGrow: 1, minWidth: '12rem' }}
        label='What to do?'
        value={text}
        inputProps={{ maxLength: TODO_TEXT_MAX_LENGTH }}
        onChange={(event) => change(event.target.value)}
        onBlur={settle}
        onKeyDown={(event) => {
          if (event.key === 'Enter') settle()
        }}
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
