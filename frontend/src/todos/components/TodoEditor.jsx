import React from 'react'
import { Box } from '@mui/material'

/** Named region grouping the composer and the Todos of the active Todo List. */
/** @param {{children: React.ReactNode}} props */
export const TodoEditor = ({ children }) => (
  <Box
    role='region'
    aria-label='Todo editor'
    sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}
  >
    {children}
  </Box>
)
