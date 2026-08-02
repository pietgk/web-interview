import React from 'react'
import { Checkbox, FormControl, InputLabel } from '@mui/material'
import { alpha } from '@mui/material/styles'

/** @param {import('@mui/material/styles').Theme} theme */
const fieldBorderColor = (theme) => alpha(theme.palette.text.primary, 0.23)

const fieldSx = {
  width: '5rem',
  height: '56px',
  boxSizing: 'border-box',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid',
  borderColor: fieldBorderColor,
  borderRadius: 1,
  cursor: 'pointer',
  '&:hover': {
    borderColor: 'text.primary',
  },
  '&:focus-within': {
    borderColor: 'primary.main',
    borderWidth: '2px',
  },
  '&:focus-within .MuiInputLabel-root': {
    color: 'primary.main',
  },
}

/**
 * @param {{completed: boolean, onChange: (completed: boolean) => void, todoLabel: string}} props
 */
export const CompletionField = ({ completed, onChange, todoLabel }) => (
  <FormControl component='label' variant='outlined' sx={fieldSx}>
    <InputLabel
      component='span'
      shrink
      sx={{ paddingX: '4px', backgroundColor: 'background.paper' }}
    >
      Done
    </InputLabel>
    <Checkbox
      checked={completed}
      onChange={(event) => onChange(event.target.checked)}
      inputProps={{ 'aria-label': `Mark completed: ${todoLabel}` }}
    />
  </FormControl>
)
