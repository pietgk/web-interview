import React from 'react'
import { Button, Typography } from '@mui/material'

/** @typedef {{message: string | null, tone: 'error' | 'secondary', showRetry: boolean}} SaveChrome */

/** @param {{saveChrome: SaveChrome, onRetry: () => void}} props */
export const SaveStatus = ({ saveChrome, onRetry }) => {
  const failed = saveChrome.tone === 'error'

  return (
    <div
      role={failed ? 'alert' : 'status'}
      aria-label='Save status'
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        marginBottom: '0.5rem',
        minHeight: '1.25rem',
      }}
    >
      <Typography variant='body2' color={failed ? 'error' : 'text.secondary'}>
        {saveChrome.message}
      </Typography>
      {saveChrome.showRetry && (
        <Button
          type='button'
          size='small'
          color='primary'
          onClick={onRetry}
          aria-label='Retry saving todo list'
        >
          Retry
        </Button>
      )}
    </div>
  )
}
