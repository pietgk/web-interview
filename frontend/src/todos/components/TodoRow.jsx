import React from 'react'

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  columnGap: '8px',
  rowGap: '16px',
  paddingTop: '16px',
  flexWrap: 'wrap',
}

export const TodoRow = ({ ariaLabel, onBlur, children }) => (
  <div role='group' aria-label={ariaLabel} onBlur={onBlur} style={rowStyle}>
    {children}
  </div>
)
