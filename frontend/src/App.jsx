import React from 'react'
import { Box } from '@mui/material'
import { StatusBar } from './todos/components/StatusBar'
import { TodoLists } from './todos/components/TodoLists'
import { useTodoLists } from './todos/useTodoLists'

/** @typedef {NonNullable<Parameters<typeof useTodoLists>[0]>} UseTodoListsOptions */

/** @param {Pick<UseTodoListsOptions, 'createClient'>} [props] */
const App = ({ createClient } = {}) => {
  const runtime = useTodoLists(createClient ? { createClient } : {})

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <Box sx={{ width: '100%', maxWidth: '80rem', margin: '0 auto', padding: 2, boxSizing: 'border-box' }}>
        <StatusBar runtime={runtime} />
      </Box>
      <Box component='main' sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <Box sx={{ width: '100%', maxWidth: '80rem', margin: '0 auto' }}>
          <TodoLists runtime={runtime} style={{ margin: '0 1rem 1rem' }} />
        </Box>
      </Box>
    </Box>
  )
}

export default App
