import { useEffect, useRef, useState } from 'react'

/**
 * Debounce a value; useful for autosave without saving every keystroke.
 */
export const useDebouncedValue = (value, delayMs = 400) => {
  const [debounced, setDebounced] = useState(value)
  const firstRender = useRef(true)

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      setDebounced(value)
      return undefined
    }

    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
