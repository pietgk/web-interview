import React from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material'

/** @param {{open: boolean, details: import('@web-interview/todos/types').StatusBarDetails | null, onClose: () => void}} props */
export const StatusDetailsDialog = ({ open, details, onClose }) => (
  <Dialog open={open} onClose={onClose} aria-labelledby='status-details-title'>
    <DialogTitle id='status-details-title'>Status details</DialogTitle>
    <DialogContent>
      <DialogContentText>
        {details?.reason ?? 'No further detail is available.'}
      </DialogContentText>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Close</Button>
    </DialogActions>
  </Dialog>
)

export default StatusDetailsDialog
