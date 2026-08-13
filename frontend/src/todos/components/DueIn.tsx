import React from 'react'
import { TextField } from '@mui/material'
import { getDueStatus } from '../todoModel.ts'
import type { DueStatus } from '../todoModel.ts'

const dueInLabel = (status: DueStatus | null) => {
  return status?.label ?? 'Due date'
}

export const DueIn = ({ dueDate, completed, onChange, todoLabel, today }: {
  dueDate: string | null,
  completed: boolean,
  onChange: (dueDate: string | null) => void,
  todoLabel: string,
  today: string
}) => {
  const dueStatus = completed ? null : getDueStatus(dueDate, { today })
  const label = dueInLabel(dueStatus)

  return (
    <TextField
      sx={{ width: (theme) => theme.todos.field.dueDate }}
      label={label}
      type='date'
      value={dueDate || ''}
      onChange={(event) => onChange(event.target.value || null)}
      error={dueStatus?.kind === 'overdue'}
      slotProps={{
        htmlInput: { 'aria-label': `${label}: ${todoLabel}` },
        inputLabel: { shrink: true }
      }} />
  )
}
