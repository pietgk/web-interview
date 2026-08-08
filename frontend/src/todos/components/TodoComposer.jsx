import React, { useRef } from 'react'
import { TextField, IconButton } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { TODO_TEXT_MAX_LENGTH } from '@web-interview/todos/protocol'
import { focusLeft } from './focusLeft'
import { TodoRow } from './TodoRow'

/**
 * @param {{
 *   text: string,
 *   onChange: (text: string) => void,
 *   onSubmit?: () => void,
 *   onCommit?: () => void,
 *   focusRef?: React.MutableRefObject<HTMLInputElement | null>
 * }} props
 */
export const TodoComposer = ({ text, onChange, onSubmit, onCommit, focusRef }) => {
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
        inputRef={(node) => {
          inputRef.current = node
          if (focusRef) focusRef.current = node
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            submit()
          }
        }}
        inputProps={{ 'aria-label': 'Add a todo', maxLength: TODO_TEXT_MAX_LENGTH }}
      />
      <IconButton color='secondary' onClick={submit} aria-label='Add todo'>
        <AddIcon aria-hidden />
      </IconButton>
    </TodoRow>
  )
}
