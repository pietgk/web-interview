import React from 'react'
import { Checkbox, FormControl, InputLabel } from '@mui/material'
import { alpha, lighten } from '@mui/material/styles'
import type { Theme } from '@mui/material/styles'

const fieldBorderColor = (theme: Theme) =>
  alpha(theme.palette.text.primary, theme.todos.control.borderOpacity)

const fieldSx = {
  width: (theme: Theme) =>
    theme.todos.field.completion,
  height: (theme: Theme) =>
    theme.todos.control.height,
  boxSizing: 'border-box',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid',
  borderColor: fieldBorderColor,
  borderRadius: 1,
  cursor: 'pointer',
  '@media (prefers-contrast: more)': {
    borderColor: (theme: Theme) =>
      alpha(theme.palette.text.primary, theme.todos.contrastMore.borderOpacity),
  },
  '&:hover': {
    borderColor: 'text.primary',
  },
  '&:focus-within': {
    borderColor: 'primary.main',
    borderWidth: (theme: Theme) =>
      theme.todos.control.focusBorderWidth,
  },
  '&:focus-within .MuiInputLabel-root': {
    color: 'primary.main',
  },
}

/**
 * The label sits on the border, so it has to paint over it. A real outlined
 * input cuts a notch in a fieldset instead; this one is hand-drawn, so it has to
 * repaint the surface underneath - and that surface is an elevated Card, not
 * flat `background.paper`. Getting this wrong shows as a darker patch in dark
 * mode, which is what it did until dark mode became reachable.
 */
const labelSx = {
  paddingX: (theme: Theme) =>
    theme.todos.control.labelNotchPadding,
  backgroundColor: (theme: Theme) =>
    theme.palette.mode === 'dark'
      ? lighten(theme.palette.background.paper, theme.todos.surface.elevatedOverlay)
      : theme.palette.background.paper,
}

export const CompletionField = ({ completed, onChange, todoLabel }: {completed: boolean, onChange: (completed: boolean) => void, todoLabel: string}) => (
  <FormControl component='label' variant='outlined' sx={fieldSx}>
    <InputLabel component='span' shrink sx={labelSx}>
      Done
    </InputLabel>
    <Checkbox
      checked={completed}
      onChange={(event) => onChange(event.target.checked)}
      slotProps={{
        input: { 'aria-label': `Mark completed: ${todoLabel}` }
      }}
    />
  </FormControl>
)
