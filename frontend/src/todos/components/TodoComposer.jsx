import React, { useRef } from 'react'
import { TextField, IconButton } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { focusLeft } from './focusLeft'
import { TodoRow } from './TodoRow'

/**
 * @param {{
 *   text: string,
 *   onChange: (text: string) => void,
 *   onSubmit?: () => void,
 *   onCommit?: () => void
 * }} props
 */
export const TodoComposer = ({ text, onChange, onSubmit, onCommit }) => {
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null))

  const submit = () => {
    onSubmit?.()
    // Plus button steals focus; return to the ghost input for the next add.
    inputRef.current?.focus()
  }

  return (
    <TodoRow
      ariaLabel='New todo'
      onBlur={(event) => {
        if (focusLeft(event)) onCommit?.()
      }}
    >
      <TextField
        sx={{ flexGrow: 1, minWidth: '12rem' }}
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
      <IconButton color='secondary' onClick={submit} aria-label='Add todo'>
        <AddIcon aria-hidden />
      </IconButton>
    </TodoRow>
  )
}
