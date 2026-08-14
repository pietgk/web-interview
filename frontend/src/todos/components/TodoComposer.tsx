import React, { useRef } from 'react'
import { TextField, IconButton } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { TODO_TEXT_MAX_LENGTH } from '@web-interview/todos/protocol'
import { focusLeft } from './focusLeft.ts'
import { TodoRow, textSlotSx } from './TodoRow.tsx'

export const TodoComposer = ({ text, onChange, onSubmit, onCommit, focusRef }: {
  text: string,
  onChange: (text: string) => void,
  onSubmit?: () => void,
  onCommit?: () => void,
  focusRef?: React.MutableRefObject<HTMLInputElement | null>
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null)

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
      text={
        <TextField
          sx={textSlotSx}
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
          slotProps={{
            htmlInput: { 'aria-label': 'Add a todo', maxLength: TODO_TEXT_MAX_LENGTH }
          }}
        />
      }
      action={
        <IconButton color='secondary' onClick={submit} aria-label='Add todo'>
          <AddIcon aria-hidden />
        </IconButton>
      }
    />
  )
}
