import React from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material'

/** @param {{open: boolean, details: import('@web-interview/todos/types').StatusBarDetails | null, listTitle?: string | null, onClose: () => void, onOpenList?: (() => void) | null}} props */
export const StatusDetailsDialog = ({
  open,
  details,
  listTitle = null,
  onClose,
  onOpenList = null,
}) => (
  <Dialog open={open} onClose={onClose} aria-labelledby='status-details-title'>
    <DialogTitle id='status-details-title'>Status details</DialogTitle>
    <DialogContent>
      <Stack spacing={1.5}>
        {listTitle && (
          <Typography>
            Affected Todo List: {listTitle}
          </Typography>
        )}
        {details?.reason && <DialogContentText>{details.reason}</DialogContentText>}
        {details?.rolledBack && (
          <DialogContentText>
            The optimistic change was rolled back to the server version.
          </DialogContentText>
        )}
        {details?.issues?.length ? (
          <Stack component='ul' spacing={0.5} sx={{ margin: 0, paddingLeft: 3 }}>
            {details.issues.map((issue, index) => (
              <Typography component='li' key={index} variant='body2'>
                {typeof issue === 'string' ? issue : JSON.stringify(issue)}
              </Typography>
            ))}
          </Stack>
        ) : null}
      </Stack>
    </DialogContent>
    <DialogActions>
      {onOpenList && <Button onClick={onOpenList}>Open Todo List</Button>}
      <Button onClick={onClose}>Close</Button>
    </DialogActions>
  </Dialog>
)
