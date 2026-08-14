import type { FocusEvent } from 'react'

/** True when focus left this element for something outside it (not a child). */
export const focusLeft = (event: FocusEvent<HTMLElement>) =>
  !event.currentTarget.contains(event.relatedTarget)
