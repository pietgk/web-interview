import React, { useEffect, useRef, useState } from 'react'
import { TextField } from '@mui/material'
import { TODO_LIST_TITLE_MAX_LENGTH } from '@web-interview/todos/protocol'

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
  const [value, setValue] = useState(title)
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null))
  const materializedRef = useRef(!draft)
  const blank = value.trim().length === 0

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setValue(title)
  }, [title])

  /** @param {{focusComposer?: boolean}} [options] */
  const accept = ({ focusComposer = false } = {}) => {
    const trimmed = value.trim()
    if (!trimmed) return
    setValue(trimmed)
    if (draft && !materializedRef.current) {
      materializedRef.current = true
      onMaterialize(trimmed)
    } else {
      onTitleChange(trimmed)
    }
    if (focusComposer) onAccept?.()
  }

  return (
    <TextField
      fullWidth
      autoFocus={autoFocus}
      inputRef={(node) => {
        inputRef.current = node
        if (focusRef) focusRef.current = node
      }}
      label='Todo List name'
      value={value}
      error={!draft && blank}
      helperText={!draft && blank ? 'Todo List name is required' : ' '}
      inputProps={{ maxLength: TODO_LIST_TITLE_MAX_LENGTH }}
      onChange={(event) => {
        const next = event.target.value
        const trimmed = next.trim()
        setValue(next)
        if (!trimmed) return
        if (draft && !materializedRef.current) {
          materializedRef.current = true
          onMaterialize(trimmed)
          return
        }
        if (!draft) onTitleChange(trimmed)
      }}
      onBlur={() => {
        if (blank) {
          if (!draft) setValue(title)
          return
        }
        accept()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          accept({ focusComposer: true })
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          if (draft && !materializedRef.current) onCancelDraft()
          else setValue(title)
        }
      }}
    />
  )
}
