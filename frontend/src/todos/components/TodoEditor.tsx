import React from 'react'
import { Box } from '@mui/material'

/** Named region grouping the composer and the Todos of the active Todo List. */
export const TodoEditor = ({ children }: {children: React.ReactNode}) => (
  <Box
    role='region'
    aria-label='Todo editor'
    sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}
  >
    {children}
  </Box>
)
