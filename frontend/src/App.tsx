import React from 'react'
import { Box } from '@mui/material'
import type { Theme } from '@mui/material/styles'
import { StatusBar } from './todos/components/StatusBar.tsx'
import { TodoLists } from './todos/components/TodoLists.tsx'
import { useTodoLists } from './todos/useTodoLists.ts'

type UseTodoListsOptions = NonNullable<Parameters<typeof useTodoLists>[0]>

/** The viewport owns the height; only the main region scrolls. */
const shellSx = (theme: Theme) => ({
  display: 'flex',
  flexDirection: 'column',
  height: theme.todos.layout.viewportHeight,
  minHeight: 0,
  overflow: 'hidden',
  backgroundColor: theme.todos.layout.backdrop ?? theme.palette.background.default,
})

/**
 * Centres a band on the page's reading measure. Applied to the status bar and
 * the lists separately so each scrolls independently but shares one edge.
 */
const measureSx = (theme: Theme) => ({
  width: '100%',
  maxWidth: theme.todos.layout.maxWidth,
  marginX: 'auto',
  boxSizing: 'border-box',
})

const App = ({ createClient }: Pick<UseTodoListsOptions, 'createClient'> = {}) => {
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
