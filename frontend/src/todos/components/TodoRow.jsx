import React from 'react'

/** @type {React.CSSProperties} */
const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  columnGap: '8px',
  rowGap: '16px',
  paddingTop: '16px',
  flexWrap: 'wrap',
}

/**
 * @param {{
 *   ariaLabel: string,
 *   onBlur?: React.FocusEventHandler<HTMLDivElement>,
 *   children: React.ReactNode
 * }} props
 */
export const TodoRow = ({ ariaLabel, onBlur, children }) => (
  <div role='group' aria-label={ariaLabel} onBlur={onBlur} style={rowStyle}>
    {children}
  </div>
)
