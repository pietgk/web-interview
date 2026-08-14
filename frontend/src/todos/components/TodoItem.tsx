import React from 'react'
import {
  TextField,
  IconButton,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import { TODO_TEXT_MAX_LENGTH } from '@web-interview/todos/protocol'
import { CompletionField } from './CompletionField.tsx'
import { DueIn } from './DueIn.tsx'
import { TodoRow, textSlotSx } from './TodoRow.tsx'
import { useSettledText } from '../useSettledText.ts'
import type { Todo } from '@web-interview/todos/types'

type TodoPatch = Partial<Pick<Todo, 'text' | 'completed' | 'dueDate'>>

const todoLabel = (todo: Todo) => {
  const text = String(todo?.text ?? '').trim()
  return text || 'untitled'
}

export const TodoItem = ({ todo, onChange, onRemove, today }: {
  todo: Todo,
  onChange: (patch: TodoPatch) => void,
  onRemove: () => void,
  today: string
}) => {
  const label = todoLabel(todo)
  const { text, change, settle } = useSettledText(todo.text, (next) =>
    onChange({ text: next })
  )

  return (
    <TodoRow
      ariaLabel={`Todo: ${label}`}
      completion={
        <CompletionField
          completed={todo.completed}
          onChange={(completed) => onChange({ completed })}
          todoLabel={label}
        />
      }
      dueDate={
        <DueIn
          dueDate={todo.dueDate}
          completed={todo.completed}
          onChange={(dueDate) => onChange({ dueDate })}
          todoLabel={label}
          today={today}
        />
      }
      text={
        <TextField
          sx={textSlotSx}
          label='What to do?'
          value={text}
          onChange={(event) => change(event.target.value)}
          onBlur={settle}
          onKeyDown={(event) => {
            if (event.key === 'Enter') settle()
          }}
          slotProps={{
            htmlInput: { maxLength: TODO_TEXT_MAX_LENGTH }
          }}
        />
      }
      action={
        <IconButton
          color='secondary'
          onClick={onRemove}
          aria-label={`Delete todo: ${label}`}
        >
          <DeleteIcon aria-hidden />
        </IconButton>
      }
    />
  )
}
