import React, { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  IconButton,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { ACTOR_EVENT } from '@web-interview/todos/protocol'
import { selectStatusBar } from '@web-interview/todos/selectors'
import { StatusDetailsDialog } from './StatusDetailsDialog'

/** @typedef {{actor: import('@web-interview/todos/actor').TodoListActor, clientId: string, snapshot: import('@web-interview/todos/types').TodoListSnapshot}} TodoRuntime */

/** @param {{runtime: TodoRuntime, onOpenList?: (listId: string) => void}} props */
export const StatusBar = ({ runtime, onOpenList }) => {
  const { actor, snapshot } = runtime
  const status = selectStatusBar(snapshot)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const detailsListId = status.details?.listId ?? null
  const detailsList = detailsListId ? snapshot.readModel[detailsListId] : null

  const runAction = () => {
    if (!status.action) return
    if (status.action.event === 'REVIEW_REJECTION') {
      setDetailsOpen(true)
      return
    }
    actor.send({ type: status.action.event })
  }

  const dismiss = () => {
    const transactionId = status.details?.rejectionId
    if (!transactionId) return
    actor.send({
      type: ACTOR_EVENT.DISMISS_REJECTION,
      transactionId,
    })
  }

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
          status.action || status.details || status.dismissible ? (
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
              {status.details && status.action?.event !== 'REVIEW_REJECTION' && (
                <Button color='inherit' size='small' onClick={() => setDetailsOpen(true)}>
                  Details
                </Button>
              )}
              {status.action && (
                <Button color='inherit' size='small' onClick={runAction}>
                  {status.action.label}
                </Button>
              )}
              {status.dismissible && (
                <IconButton
                  color='inherit'
                  size='small'
                  aria-label='Dismiss rejected change notification'
                  onClick={dismiss}
                >
                  <CloseIcon fontSize='small' aria-hidden />
                </IconButton>
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
              {index > 0 && <Box component='span' aria-hidden sx={{ opacity: 0.45 }}>·</Box>}
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
      <StatusDetailsDialog
        open={detailsOpen}
        details={status.details}
        listTitle={detailsList?.title ?? null}
        onClose={() => setDetailsOpen(false)}
        onOpenList={detailsListId && onOpenList
          ? () => {
              onOpenList(detailsListId)
              setDetailsOpen(false)
            }
          : null}
      />
    </>
  )
}
