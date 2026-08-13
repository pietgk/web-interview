import type { Decorator } from '@storybook/react-vite'
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
} from './osMediaPrefs.ts'

const overridesKey = (overrides: Map<string, string>) =>
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
 */
export const withOsMediaPrefs: Decorator = (Story, context) => {
  const overrides = mediaFeatureOverridesFromGlobals(context.globals)
  const key = overridesKey(overrides)

  // matchMedia must be correct before story hooks run (Dialog transitions).
  if (hasMediaFeatureOverrides(overrides)) {
    syncMatchMediaOverrides(overrides)
  } else {
    clearMatchMediaOverrides()
  }

  // Storybook renders a decorator as a component, so this hook is legal. The
  // rule decides by name, and `withX` is the Storybook decorator convention.
  // Moving the hook into an uppercase inner component would insert a boundary
  // that changes when the effect commits relative to the theme provider, which
  // the comment above documents as load-bearing.
  // eslint-disable-next-line react-hooks/rules-of-hooks -- decorator is a component
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
