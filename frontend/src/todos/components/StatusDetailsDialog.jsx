import React from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Typography,
} from '@mui/material'

/** @param {{open: boolean, details: import('@web-interview/todos/types').StatusBarDetails | null, onClose: () => void}} props */
export const StatusDetailsDialog = ({ open, details, onClose }) => (
  <Dialog open={open} onClose={onClose} aria-labelledby='status-details-title'>
    <DialogTitle id='status-details-title'>Status details</DialogTitle>
    <DialogContent>
      {details ? (
        <Box>
          <DialogContentText>{details.message}</DialogContentText>
          <Box component='dl' sx={{ display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', gap: 1, margin: 0 }}>
            <Typography component='dt' fontWeight='bold'>Code</Typography>
            <Typography component='dd' sx={{ margin: 0, overflowWrap: 'anywhere' }}>{details.code}</Typography>
            <Typography component='dt' fontWeight='bold'>HTTP status</Typography>
            <Typography component='dd' sx={{ margin: 0 }}>
              {details.status ?? 'No response'}
            </Typography>
          </Box>
          {details.issues.length > 0 && (
            <Box component='ul' sx={{ marginBottom: 0, paddingLeft: 3 }}>
              {details.issues.map((issue, index) => (
                <Typography component='li' key={`${issue.path.join('.')}-${index}`}>
                  {issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''}
                  {issue.message}
                </Typography>
              ))}
            </Box>
          )}
        </Box>
      ) : (
        <DialogContentText>No further detail is available.</DialogContentText>
      )}
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Close</Button>
    </DialogActions>
  </Dialog>
)

export default StatusDetailsDialog
