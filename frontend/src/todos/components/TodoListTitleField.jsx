import React, { useRef } from 'react'
import { TextField } from '@mui/material'
import { TODO_LIST_TITLE_MAX_LENGTH } from '@web-interview/todos/protocol'
import { useSettledText } from '../useSettledText'

/** @param {{title: string, draft?: boolean, autoFocus?: boolean, focusRef?: React.MutableRefObject<HTMLInputElement | null>, onMaterialize: (title: string) => void, onTitleChange: (title: string) => void, onCancelDraft: () => void, onAccept?: () => void}} props */
export const TodoListTitleField = ({
  title,
  draft = false,
  autoFocus = false,
  focusRef,
  onMaterialize,
  onTitleChange,
  onCancelDraft,
  onAccept,
}) => {
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null))
  const materializedRef = useRef(!draft)
  const { text, change, settle, reset } = useSettledText(title, (next) => {
    const trimmed = next.trim()
    // A Todo List exists while it has a title, so a blank one asserts nothing.
    if (!trimmed) return
    if (!materializedRef.current) {
      materializedRef.current = true
      onMaterialize(trimmed)
      return
    }
    onTitleChange(trimmed)
  })
  const blank = text.trim().length === 0

  return (
    <TextField
      fullWidth
      autoFocus={autoFocus}
      inputRef={(node) => {
        inputRef.current = node
        if (focusRef) focusRef.current = node
      }}
      label='Todo List name'
      value={text}
      error={!draft && blank}
      helperText={!draft && blank ? 'Todo List name is required' : ' '}
      onChange={(event) => change(event.target.value)}
      onBlur={() => {
        if (blank) reset()
        else settle()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          if (blank) return
          settle()
          onAccept?.()
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          if (draft && !materializedRef.current) onCancelDraft()
          else reset()
        }
      }}
      slotProps={{
        htmlInput: { maxLength: TODO_LIST_TITLE_MAX_LENGTH }
      }}
    />
  )
}
