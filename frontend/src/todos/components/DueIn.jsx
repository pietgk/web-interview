import React from 'react'
import { TextField } from '@mui/material'
import { getDueStatus } from '../todoModel'

const dueInLabel = (status) => {
  if (!status) return 'Due date'

  if (status.kind === 'remaining') {
    return `Due in ${status.days} ${status.days === 1 ? 'day' : 'days'}`
  }

  return status.label
}

export const DueIn = ({ dueDate, completed, onChange, todoLabel, now }) => {
  const dueStatus = getDueStatus(dueDate, { completed, now })
  const label = dueInLabel(dueStatus)

  return (
    <TextField
      sx={{ width: '11rem' }}
      label={label}
      type='date'
      value={dueDate || ''}
      onChange={(event) => onChange(event.target.value || null)}
      InputLabelProps={{ shrink: true }}
      inputProps={{ 'aria-label': `${label}: ${todoLabel}` }}
      error={dueStatus?.kind === 'overdue'}
    />
  )
}
