import React from 'react'
import { TextField } from '@mui/material'
import { getDueStatus } from '../todoModel'

const dueInLabel = (status) => {
  return status?.label ?? 'Due date'
}

/**
 * @param {{
 *   dueDate: string | null,
 *   completed: boolean,
 *   onChange: (dueDate: string | null) => void,
 *   todoLabel: string,
 *   now?: Date
 * }} props
 */
export const DueIn = ({ dueDate, completed, onChange, todoLabel, now }) => {
  const dueStatus = completed ? null : getDueStatus(dueDate, { now })
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
