import { useEffect } from 'react'
import {
  applyCssMediaFeatureOverrides,
  applyOsMediaPrefs,
  clearMatchMediaOverrides,
  hasMediaFeatureOverrides,
  mediaFeatureOverridesFromGlobals,
  OS_MEDIA_PREF_SYSTEM,
  restoreCssMediaFeatureOverrides,
  syncMatchMediaOverrides,
} from './osMediaPrefs.js'

/**
 * Serialize active overrides for effect deps and remount keys.
 *
 * @param {Map<string, string>} overrides
 */
const overridesKey = (overrides) =>
  [...overrides.entries()]
    .map(([feature, value]) => `${feature}:${value}`)
    .sort()
    .join('|')

/**
 * Storybook decorator: honor toolbar globals for OS media prefs.
 *
 * Applies `matchMedia` overrides synchronously before the story renders so
 * MUI's `useReducedMotion` sees them on first mount. CSSOM rewrites run in
 * an effect (and on `<head>` mutations) because Emotion may append sheets
 * after the theme provider commits.
 *
 * @type {import('@storybook/react-vite').Decorator}
 */
export const withOsMediaPrefs = (Story, context) => {
  const overrides = mediaFeatureOverridesFromGlobals(context.globals)
  const key = overridesKey(overrides)

  // matchMedia must be correct before story hooks run (Dialog transitions).
  if (hasMediaFeatureOverrides(overrides)) {
    syncMatchMediaOverrides(overrides)
  } else {
    clearMatchMediaOverrides()
  }

  useEffect(() => {
    applyOsMediaPrefs(overrides)
    if (!hasMediaFeatureOverrides(overrides)) {
      return undefined
    }
    const observer = new MutationObserver(() => {
      applyCssMediaFeatureOverrides(overrides)
    })
    observer.observe(document.head, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      restoreCssMediaFeatureOverrides()
      clearMatchMediaOverrides()
    }
    // `overrides` is rebuilt each render; `key` is the stable content fingerprint.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key stands in for overrides
  }, [key])

  // Remount when prefs change so media-query subscribers re-bind cleanly.
  return <Story key={key || OS_MEDIA_PREF_SYSTEM} />
}
