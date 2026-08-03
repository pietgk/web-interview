import React from 'react'

/** Named region grouping the composer and the Todos of the active Todo List. */
/** @param {{children: React.ReactNode}} props */
export const TodoEditor = ({ children }) => (
  <div
    role='region'
    aria-label='Todo editor'
    style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}
  >
    {children}
  </div>
)
