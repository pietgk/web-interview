/** Stately Inspector - development only, never in tests or production builds. */
let cachedInspect
let didLog = false
let loading

/**
 * Create the browser inspector once. It opens a new tab/window (often blocked
 * until pop-ups are allowed for localhost).
 */
export const getInspect = () => {
  if (!import.meta.env.DEV) return undefined
  if (import.meta.env.VITE_XSTATE_INSPECT === '0') return undefined
  return cachedInspect
}

/** Eagerly open the inspector at app startup (dev only). */
export const ensureInspector = async () => {
  if (!import.meta.env.DEV) return
  if (import.meta.env.VITE_XSTATE_INSPECT === '0') return
  if (cachedInspect) return
  if (loading) return loading

  loading = import('@statelyai/inspect').then(({ createBrowserInspector }) => {
    const inspector = createBrowserInspector()
    cachedInspect = inspector.inspect

    if (!didLog) {
      didLog = true
      console.info(
        'XState Inspector: opened in a new browser tab/window. ' +
          'If you do not see it, allow pop-ups for this origin and reload. ' +
          'Disable with VITE_XSTATE_INSPECT=0.'
      )
    }
  })

  return loading
}
