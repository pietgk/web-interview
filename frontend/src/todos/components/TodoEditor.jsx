import React from 'react'
import { focusLeft } from './focusLeft'

/** Blur boundary for the active list editor: leaving commits composer work and flushes. */
/** @param {{onLeave?: () => void, children: React.ReactNode}} props */
export const TodoEditor = ({ onLeave, children }) => (
  <div
    role='region'
    aria-label='Todo editor'
    style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}
    onBlur={(event) => {
      if (focusLeft(event)) onLeave?.()
    }}
  >
    {children}
  </div>
)
