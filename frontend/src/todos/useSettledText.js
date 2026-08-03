import { useEffect, useRef, useState } from 'react'
import { TEXT_SETTLE_MS } from '@web-interview/todos/protocol'

/**
 * In-flight text stays in React state and settles into one datom: 500ms idle,
 * blur, or Enter, whichever comes first. Without this, typing a twenty-character
 * Todo would mint twenty datoms on `text`, nineteen of them superseded within a
 * second, and there is no transaction envelope left to group them.
 *
 * Unmounting settles rather than discards, so leaving a field by switching Todo
 * Lists keeps the edit.
 *
 * @param {string} value the settled value, from the read model
 * @param {(text: string) => void} onSettle
 */
export const useSettledText = (value, onSettle) => {
  const [text, setText] = useState(value)
  const timer = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null))
  const draft = useRef(value)
  const settled = useRef(value)
  const latest = useRef({ value, onSettle })
  latest.current = { value, onSettle }

  useEffect(() => {
    // An edit in flight outranks an incoming one; last write wins either way.
    if (timer.current) return
    draft.current = value
    settled.current = value
    setText(value)
  }, [value])

  const settle = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (draft.current === settled.current) return
    settled.current = draft.current
    latest.current.onSettle(draft.current)
  }

  const settleRef = useRef(settle)
  settleRef.current = settle

  useEffect(() => () => settleRef.current(), [])

  /** @param {string} next */
  const change = (next) => {
    draft.current = next
    setText(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => settleRef.current(), TEXT_SETTLE_MS)
  }

  const reset = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    draft.current = latest.current.value
    settled.current = latest.current.value
    setText(latest.current.value)
  }

  return { text, change, settle, reset }
}
