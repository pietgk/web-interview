/** True when focus left this element for something outside it (not a child). */
/** @param {import('react').FocusEvent<HTMLElement>} event */
export const focusLeft = (event) =>
  !event.currentTarget.contains(event.relatedTarget)
