import React from 'react'
import { Box } from '@mui/material'

/**
 * Named slots rather than free children, so the row - not each caller - owns
 * where a control lands. A composer row fills only `text` and `action`, and its
 * text field still starts on the same column as every Todo below it.
 *
 * Wide enough for the whole row, that is a four-column grid. Narrower than
 * that, the columns would not fit, so it falls back to the wrapping flex row
 * this component has always been.
 */
const rowSx = {
  display: { xs: 'flex', sm: 'grid' },
  gridTemplateColumns: (/** @type {import('@mui/material/styles').Theme} */ theme) =>
    [
      theme.todos.field.completion,
      theme.todos.field.dueDate,
      `minmax(${theme.todos.field.textMin}, 1fr)`,
      'auto',
    ].join(' '),
  alignItems: 'center',
  flexWrap: 'wrap',
  columnGap: 1,
  rowGap: 2,
  paddingTop: 2,
}

/** Holds a column open for a slot this row does not fill. Absent when wrapping. */
const emptySlotSx = { display: { xs: 'none', sm: 'block' } }

/**
 * The `text` slot absorbs the leftover width in either mode, so both fillers of
 * that slot style it the same way. Exported rather than copied, because the two
 * call sites drifting apart is the bug this row exists to prevent.
 */
export const textSlotSx = {
  flexGrow: 1,
  minWidth: (/** @type {import('@mui/material/styles').Theme} */ theme) =>
    theme.todos.field.textMin,
}

/**
 * @param {{
 *   ariaLabel: string,
 *   onBlur?: React.FocusEventHandler<HTMLDivElement>,
 *   completion?: React.ReactNode,
 *   dueDate?: React.ReactNode,
 *   text: React.ReactNode,
 *   action: React.ReactNode
 * }} props
 */
export const TodoRow = ({ ariaLabel, onBlur, completion, dueDate, text, action }) => (
  <Box role='group' aria-label={ariaLabel} onBlur={onBlur} sx={rowSx}>
    {completion ?? <Box aria-hidden sx={emptySlotSx} />}
    {dueDate ?? <Box aria-hidden sx={emptySlotSx} />}
    {text}
    {action}
  </Box>
)
