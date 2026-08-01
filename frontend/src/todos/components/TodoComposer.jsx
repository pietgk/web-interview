import React, { useRef } from 'react'
import { TextField, Button } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'

export const TodoComposer = ({ text, onChange, onSubmit }) => {
  const inputRef = useRef(null)

  const submit = () => {
    onSubmit?.()
    // Plus button steals focus; return to the ghost input for the next add.
    inputRef.current?.focus()
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      <TextField
        sx={{ flexGrow: 1, minWidth: '12rem', marginTop: '1rem' }}
        label='Add a todo'
        value={text}
        onChange={(event) => onChange(event.target.value)}
        inputRef={inputRef}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            submit()
          }
        }}
        inputProps={{ 'aria-label': 'Add a todo' }}
      />
      <Button
        sx={{ margin: '8px' }}
        size='small'
        color='secondary'
        onClick={submit}
        aria-label='Add todo'
      >
        <AddIcon aria-hidden />
      </Button>
    </div>
  )
}
