import React, { lazy, Suspense, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Typography,
} from '@mui/material'
import { selectStatusBar } from '@web-interview/todos/selectors'

import type { TodoRuntime } from '../useTodoLists.ts'

const StatusDetailsDialog = lazy(() => import('./StatusDetailsDialog.tsx'))

export const StatusBar = ({ runtime }: {runtime: TodoRuntime}) => {
  const { client, status: clientStatus } = runtime
  const status = selectStatusBar(clientStatus)
  const [detailsOpen, setDetailsOpen] = useState(false)

  return (
    <>
      <Alert
        variant='outlined'
        severity={status.severity}
        role={status.severity === 'error' || status.severity === 'warning' ? 'alert' : 'status'}
        aria-label='Application status'
        sx={{
          alignItems: 'center',
          '& .MuiAlert-message': { flexGrow: 1, minWidth: 0 },
          '& .MuiAlert-action': { alignItems: 'center', flexWrap: 'wrap' },
        }}
        action={
          status.action || status.details ? (
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
              {status.details && (
                <Button color='inherit' size='small' onClick={() => setDetailsOpen(true)}>
                  Details
                </Button>
              )}
              {status.action && (
                <Button color='inherit' size='small' onClick={() => client.reconnect()}>
                  {status.action.label}
                </Button>
              )}
            </Box>
          ) : undefined
        }
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'baseline',
            flexWrap: 'wrap',
            columnGap: 1,
            rowGap: 0.25,
          }}
        >
          {status.parts.map((part, index) => (
            <React.Fragment key={part.id}>
              {index > 0 && (
                <Box
                  component='span'
                  aria-hidden
                  sx={{
                    opacity: (theme) => theme.todos.emphasis.muted,
                    '@media (prefers-contrast: more)': {
                      opacity: (theme) => theme.todos.contrastMore.muted,
                    },
                  }}
                >
                  ·
                </Box>
              )}
              <Typography
                component={part.id === 'title' ? 'h1' : 'span'}
                variant={part.id === 'title' ? 'h6' : 'body2'}
              >
                {part.text}
              </Typography>
            </React.Fragment>
          ))}
        </Box>
      </Alert>
      {detailsOpen && (
        <Suspense fallback={null}>
          <StatusDetailsDialog
            open
            details={status.details}
            onClose={() => setDetailsOpen(false)}
          />
        </Suspense>
      )}
    </>
  )
}
