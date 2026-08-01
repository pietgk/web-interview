import React from 'react'
import {
  TextField,
  Button,
  Typography,
  Checkbox,
  FormControlLabel,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import { getDueStatus } from '../todoModel'

export const TodoItem = ({ todo, index, onChange, onRemove, now }) => {
  const dueStatus = getDueStatus(todo.dueDate, {
    completed: todo.completed,
    now,
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      <Typography sx={{ margin: '8px' }} variant='h6'>
        {index + 1}
      </Typography>
      <FormControlLabel
        control={
          <Checkbox
            checked={todo.completed}
            onChange={(event) => onChange({ completed: event.target.checked })}
            inputProps={{ 'aria-label': `Mark todo ${index + 1} completed` }}
          />
        }
        label='Done'
      />
      <TextField
        sx={{ flexGrow: 1, minWidth: '12rem', marginTop: '1rem' }}
        label='What to do?'
        value={todo.text}
        onChange={(event) => onChange({ text: event.target.value })}
      />
      <TextField
        sx={{ marginTop: '1rem', width: '11rem' }}
        label='Due date'
        type='date'
        value={todo.dueDate || ''}
        onChange={(event) => onChange({ dueDate: event.target.value || null })}
        InputLabelProps={{ shrink: true }}
        inputProps={{ 'aria-label': `Due date for todo ${index + 1}` }}
      />
      {dueStatus && (
        <Typography
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
        aria-label={`Delete todo ${index + 1}`}
      >
        <DeleteIcon />
      </Button>
    </div>
  )
}
