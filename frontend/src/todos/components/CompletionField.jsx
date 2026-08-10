import React from 'react'
import { Checkbox, FormControl, InputLabel } from '@mui/material'
import { alpha, lighten } from '@mui/material/styles'

/** @param {import('@mui/material/styles').Theme} theme */
const fieldBorderColor = (theme) =>
  alpha(theme.palette.text.primary, theme.todos.control.borderOpacity)

const fieldSx = {
  width: (/** @type {import('@mui/material/styles').Theme} */ theme) =>
    theme.todos.field.completion,
  height: (/** @type {import('@mui/material/styles').Theme} */ theme) =>
    theme.todos.control.height,
  boxSizing: 'border-box',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid',
  borderColor: fieldBorderColor,
  borderRadius: 1,
  cursor: 'pointer',
  '@media (prefers-contrast: more)': {
    borderColor: (/** @type {import('@mui/material/styles').Theme} */ theme) =>
      alpha(theme.palette.text.primary, theme.todos.contrastMore.borderOpacity),
  },
  '&:hover': {
    borderColor: 'text.primary',
  },
  '&:focus-within': {
    borderColor: 'primary.main',
    borderWidth: (/** @type {import('@mui/material/styles').Theme} */ theme) =>
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
  paddingX: (/** @type {import('@mui/material/styles').Theme} */ theme) =>
    theme.todos.control.labelNotchPadding,
  backgroundColor: (/** @type {import('@mui/material/styles').Theme} */ theme) =>
    theme.palette.mode === 'dark'
      ? lighten(theme.palette.background.paper, theme.todos.surface.elevatedOverlay)
      : theme.palette.background.paper,
}

/**
 * @param {{completed: boolean, onChange: (completed: boolean) => void, todoLabel: string}} props
 */
export const CompletionField = ({ completed, onChange, todoLabel }) => (
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
