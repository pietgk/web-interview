/**
 * Storybook-only emulation of OS CSS media preferences.
 *
 * Real browsers expose these via CDP (`emulateMedia`); the Storybook canvas
 * iframe cannot. This module rewrites matching `@media` rules in the CSSOM and
 * shims `window.matchMedia` so MUI's JS reduced-motion path (`useReducedMotion`)
 * and Emotion-generated `@media` blocks both honor the toolbar.
 *
 * Defaults must stay at {@link OS_MEDIA_PREF_SYSTEM}: Vitest browser stories
 * must not see mutated stylesheets or a matchMedia shim.
 */

/** Toolbar / globals sentinel: leave the real browser preference alone. */
export const OS_MEDIA_PREF_SYSTEM = 'system'

/** CSS media feature for `prefers-reduced-motion`. */
export const PREFERS_REDUCED_MOTION = 'prefers-reduced-motion'

/** CSS media feature for `prefers-contrast`. */
export const PREFERS_CONTRAST = 'prefers-contrast'

/** CSS media feature for `forced-colors` (Windows High Contrast, etc.). */
export const FORCED_COLORS = 'forced-colors'

/**
 * Media features the toolbar can override, with the discrete values we expose.
 * `system` is not listed — it means "do not override".
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const OS_MEDIA_FEATURE_VALUES = Object.freeze({
  [PREFERS_REDUCED_MOTION]: Object.freeze(['no-preference', 'reduce']),
  [PREFERS_CONTRAST]: Object.freeze(['no-preference', 'more']),
  [FORCED_COLORS]: Object.freeze(['none', 'active']),
})

/** @type {WeakMap<CSSMediaRule, string>} */
const originalMediaTextByRule = new WeakMap()

/** @type {((query: string) => MediaQueryList) | null} */
let nativeMatchMedia = null

/** @type {Map<string, string> | null} */
let activeFeatureOverrides = null

/** @type {Set<() => void>} */
const matchMediaListeners = new Set()

/**
 * @param {Record<string, string | undefined>} globals
 * @returns {Map<string, string>}
 */
export const mediaFeatureOverridesFromGlobals = (globals) => {
  /** @type {Map<string, string>} */
  const overrides = new Map()
  const pairs = [
    [globals.prefersReducedMotion, PREFERS_REDUCED_MOTION],
    [globals.prefersContrast, PREFERS_CONTRAST],
    [globals.forcedColors, FORCED_COLORS],
  ]
  for (const [value, feature] of pairs) {
    if (value == null || value === OS_MEDIA_PREF_SYSTEM) continue
    const allowed = OS_MEDIA_FEATURE_VALUES[feature]
    if (!allowed.includes(value)) continue
    overrides.set(feature, value)
  }
  return overrides
}

/**
 * @param {Map<string, string>} overrides
 */
export const hasMediaFeatureOverrides = (overrides) => overrides.size > 0

/**
 * Replace `(feature: value)` / `(feature)` conditions so only the chosen
 * preference matches. Restores the rule's original media text first.
 *
 * @param {string} mediaText
 * @param {Map<string, string>} overrides
 */
export const rewriteMediaText = (mediaText, overrides) => {
  let next = mediaText
  for (const [feature, chosen] of overrides) {
    if (!next.includes(feature)) continue
    for (const alternate of OS_MEDIA_FEATURE_VALUES[feature]) {
      const token = `(${feature}: ${alternate})`
      if (!next.includes(token)) continue
      next = next.split(token).join(alternate === chosen ? 'all' : 'not all')
    }
    const booleanToken = `(${feature})`
    if (next.includes(booleanToken)) {
      const enableBoolean =
        chosen !== 'no-preference' && chosen !== 'none'
      next = next
        .split(booleanToken)
        .join(enableBoolean ? 'all' : 'not all')
    }
  }
  return next
}

/**
 * @param {string} query
 * @param {Map<string, string>} overrides
 * @returns {boolean | undefined} override, or `undefined` to keep the native result
 */
export const resolveMatchMediaOverride = (query, overrides) => {
  for (const [feature, chosen] of overrides) {
    if (!query.includes(feature)) continue
    const valued = query.match(
      new RegExp(`\\(${feature}:\\s*([^)]+)\\)`)
    )
    if (valued) {
      return valued[1].trim() === chosen
    }
    if (query.includes(`(${feature})`)) {
      return chosen !== 'no-preference' && chosen !== 'none'
    }
  }
  return undefined
}

/**
 * @returns {CSSStyleSheet[]}
 */
const collectStyleSheets = () => {
  /** @type {CSSStyleSheet[]} */
  const sheets = []
  for (const sheet of document.styleSheets) {
    sheets.push(sheet)
  }
  if (document.adoptedStyleSheets) {
    for (const sheet of document.adoptedStyleSheets) {
      sheets.push(sheet)
    }
  }
  return sheets
}

/**
 * @param {CSSRuleList | CSSRule[]} rules
 * @param {Map<string, string>} overrides
 */
const processCssRules = (rules, overrides) => {
  for (const rule of rules) {
    if (rule instanceof CSSMediaRule) {
      if (!originalMediaTextByRule.has(rule)) {
        originalMediaTextByRule.set(rule, rule.media.mediaText)
      }
      const original = originalMediaTextByRule.get(rule) ?? rule.media.mediaText
      const next =
        overrides.size === 0
          ? original
          : rewriteMediaText(original, overrides)
      if (rule.media.mediaText !== next) {
        rule.media.mediaText = next
      }
      processCssRules(rule.cssRules, overrides)
      continue
    }
    if ('cssRules' in rule && rule.cssRules) {
      try {
        processCssRules(/** @type {CSSGroupingRule} */ (rule).cssRules, overrides)
      } catch {
        // Nested rules on cross-origin sheets throw; skip.
      }
    }
  }
}

/**
 * Apply or clear CSSOM media-feature overrides across document stylesheets.
 *
 * @param {Map<string, string>} overrides
 */
export const applyCssMediaFeatureOverrides = (overrides) => {
  for (const sheet of collectStyleSheets()) {
    try {
      processCssRules(sheet.cssRules, overrides)
    } catch {
      // Cross-origin stylesheets deny cssRules; ignore.
    }
  }
}

/**
 * Restore every previously rewritten media rule to its original text.
 */
export const restoreCssMediaFeatureOverrides = () => {
  applyCssMediaFeatureOverrides(new Map())
}

const notifyMatchMediaListeners = () => {
  for (const listener of matchMediaListeners) {
    listener()
  }
}

/**
 * @param {MediaQueryList} native
 * @param {string} query
 * @returns {MediaQueryList}
 */
const wrapMediaQueryList = (native, query) => {
  const readMatches = () => {
    if (!activeFeatureOverrides || activeFeatureOverrides.size === 0) {
      return native.matches
    }
    const overridden = resolveMatchMediaOverride(query, activeFeatureOverrides)
    return overridden === undefined ? native.matches : overridden
  }

  /** @type {Set<EventListener>} */
  const listeners = new Set()

  const onActiveChange = () => {
    const event = new Event('change')
    Object.defineProperty(event, 'matches', { value: readMatches() })
    for (const listener of listeners) {
      listener.call(native, event)
    }
  }
  matchMediaListeners.add(onActiveChange)

  /** @type {MediaQueryList} */
  const wrapped = {
    get matches() {
      return readMatches()
    },
    get media() {
      return native.media
    },
    get onchange() {
      return native.onchange
    },
    set onchange(handler) {
      native.onchange = handler
    },
    addListener(listener) {
      if (listener) listeners.add(/** @type {EventListener} */ (listener))
    },
    removeListener(listener) {
      if (listener) listeners.delete(/** @type {EventListener} */ (listener))
    },
    addEventListener(type, listener, options) {
      if (type === 'change' && listener) {
        listeners.add(/** @type {EventListener} */ (listener))
        return
      }
      native.addEventListener(type, listener, options)
    },
    removeEventListener(type, listener, options) {
      if (type === 'change' && listener) {
        listeners.delete(/** @type {EventListener} */ (listener))
        return
      }
      native.removeEventListener(type, listener, options)
    },
    dispatchEvent(event) {
      return native.dispatchEvent(event)
    },
  }
  return wrapped
}

/**
 * Install a `matchMedia` shim that honors the active feature map. Idempotent.
 *
 * @param {Map<string, string>} overrides
 */
export const syncMatchMediaOverrides = (overrides) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return
  }
  if (!nativeMatchMedia) {
    nativeMatchMedia = window.matchMedia.bind(window)
    window.matchMedia = (query) => {
      const native = /** @type {(q: string) => MediaQueryList} */ (nativeMatchMedia)(
        query
      )
      if (!activeFeatureOverrides || activeFeatureOverrides.size === 0) {
        return native
      }
      return wrapMediaQueryList(native, query)
    }
  }
  activeFeatureOverrides = overrides
  notifyMatchMediaListeners()
}

/**
 * Remove the matchMedia shim and restore the native implementation.
 */
export const clearMatchMediaOverrides = () => {
  activeFeatureOverrides = null
  notifyMatchMediaListeners()
  matchMediaListeners.clear()
  if (nativeMatchMedia && typeof window !== 'undefined') {
    window.matchMedia = nativeMatchMedia
    nativeMatchMedia = null
  }
}

/**
 * Apply toolbar media prefs to CSSOM + matchMedia, or clear them when empty.
 *
 * @param {Map<string, string>} overrides
 */
export const applyOsMediaPrefs = (overrides) => {
  if (!hasMediaFeatureOverrides(overrides)) {
    restoreCssMediaFeatureOverrides()
    clearMatchMediaOverrides()
    return
  }
  applyCssMediaFeatureOverrides(overrides)
  syncMatchMediaOverrides(overrides)
}
