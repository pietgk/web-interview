/** Stately Inspector - development only, never in tests or production builds. */
let cachedInspect
let didLog = false

/**
 * Create the browser inspector once. It opens a new tab/window (often blocked
 * until pop-ups are allowed for localhost).
 */
export const getInspect = () => {
  if (process.env.NODE_ENV !== 'development') return undefined
  if (process.env.REACT_APP_XSTATE_INSPECT === '0') return undefined

  if (!cachedInspect) {
    // Lazy require keeps the inspector out of Jest and unused production paths.
    const { createBrowserInspector } = require('@statelyai/inspect')
    const inspector = createBrowserInspector()
    cachedInspect = inspector.inspect

    if (!didLog) {
      didLog = true
      // eslint-disable-next-line no-console
      console.info(
        'XState Inspector: opened in a new browser tab/window. ' +
          'If you do not see it, allow pop-ups for this origin and reload. ' +
          'Disable with REACT_APP_XSTATE_INSPECT=0.'
      )
    }
  }

  return cachedInspect
}

/** Eagerly open the inspector at app startup (dev only). */
export const ensureInspector = () => {
  getInspect()
}
