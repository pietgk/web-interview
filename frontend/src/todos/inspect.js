/** Stately Inspector — development only, never in tests or production builds. */
let cachedInspect

export const getInspect = () => {
  if (process.env.NODE_ENV !== 'development') return undefined
  if (process.env.REACT_APP_XSTATE_INSPECT === '0') return undefined

  if (!cachedInspect) {
    // Lazy require keeps the inspector out of Jest and unused production paths.
    const { createBrowserInspector } = require('@statelyai/inspect')
    cachedInspect = createBrowserInspector().inspect
  }

  return cachedInspect
}
