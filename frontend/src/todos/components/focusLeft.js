/** True when focus left this element for something outside it (not a child). */
export const focusLeft = (event) =>
  !event.currentTarget.contains(event.relatedTarget)
