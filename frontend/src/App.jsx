import React from 'react'
import { Box } from '@mui/material'
import { StatusBar } from './todos/components/StatusBar'
import { TodoLists } from './todos/components/TodoLists'
import { useTodoLists } from './todos/useTodoLists'

/** @typedef {NonNullable<Parameters<typeof useTodoLists>[0]>} UseTodoListsOptions */

/** The viewport owns the height; only the main region scrolls. */
const shellSx = {
  display: 'flex',
  flexDirection: 'column',
  height: '100dvh',
  minHeight: 0,
  overflow: 'hidden',
  backgroundColor: (/** @type {import('@mui/material/styles').Theme} */ theme) =>
    theme.todos.layout.backdrop ?? theme.palette.background.default,
}

/**
 * Centres a band on the page's reading measure. Applied to the status bar and
 * the lists separately so each scrolls independently but shares one edge.
 *
 * @param {import('@mui/material/styles').Theme} theme
 */
const measureSx = (theme) => ({
  width: '100%',
  maxWidth: theme.todos.layout.maxWidth,
  marginX: 'auto',
  boxSizing: 'border-box',
})

/** @param {Pick<UseTodoListsOptions, 'createClient'>} [props] */
const App = ({ createClient } = {}) => {
  const runtime = useTodoLists(createClient ? { createClient } : {})

  return (
    <Box sx={shellSx}>
      <Box sx={(theme) => ({ ...measureSx(theme), padding: theme.todos.layout.gutter })}>
        <StatusBar runtime={runtime} />
      </Box>
      <Box component='main' sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <Box sx={measureSx}>
          <TodoLists
            runtime={runtime}
            sx={(theme) => ({
              marginX: theme.todos.layout.gutter,
              marginBottom: theme.todos.layout.gutter,
            })}
          />
        </Box>
      </Box>
    </Box>
  )
}

export default App
