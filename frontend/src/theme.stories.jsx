import React from 'react'
import { useTheme } from '@mui/material/styles'
import { expect } from 'storybook/test'
import { storyDocs } from './testing/storyDocs'

/**
 * Theme platform contracts for OS accessibility prefs (ADR 009 / prefs plan).
 * Light and dark both go through `enhanceHighContrast` and
 * `motion.reducedMotion: 'system'` in `theme.js`; Storybook's theme toolbar
 * swaps which export is active. `prefers-contrast: more` stays hand-rolled
 * under `theme.todos.contrastMore` (no MUI first-class API).
 */
const AccessibilityPlatformProbe = () => {
  const theme = useTheme()
  const hasForcedColorsOverride = Boolean(
    theme.components?.MuiListItemButton?.styleOverrides?.root
  )
  const outlinedMoreContrast = JSON.stringify(
    theme.components?.MuiOutlinedInput?.styleOverrides?.notchedOutline ?? null
  )
  const hasContrastMoreOutline = outlinedMoreContrast.includes(
    'prefers-contrast: more'
  )
  const contrastMore = theme.todos?.contrastMore
  const contrastMoreStronger =
    contrastMore != null &&
    contrastMore.borderOpacity > theme.todos.control.borderOpacity &&
    contrastMore.muted > theme.todos.emphasis.muted

  return (
    <div>
      <p>{`reducedMotion: ${theme.motion?.reducedMotion ?? 'missing'}`}</p>
      <p>
        {`forcedColorsTheme: ${hasForcedColorsOverride ? 'enhanced' : 'missing'}`}
      </p>
      <p>
        {`contrastMoreTokens: ${contrastMoreStronger ? 'stronger' : 'missing'}`}
      </p>
      <p>
        {`contrastMoreOutline: ${hasContrastMoreOutline ? 'wired' : 'missing'}`}
      </p>
    </div>
  )
}

const meta = /** @type {import('@storybook/react-vite').Meta<typeof AccessibilityPlatformProbe>} */ ({
  title: 'Foundations/Accessibility platform',
  component: AccessibilityPlatformProbe,
  parameters: {
    docs: {
      description: {
        component: [
          'Proves the shared light/dark themes honor OS motion, forced-colors,',
          'and hand-rolled `prefers-contrast: more` tokens (`motion.reducedMotion:',
          'system`, `enhanceHighContrast`, `theme.todos.contrastMore`). Media',
          'emulation itself is covered by Playwright. Storybook toolbar globals',
          '(Motion / Contrast / Forced colors) are ergonomics only — defaults',
          'stay `system` so Vitest browser runs are unaffected.',
        ].join(' '),
      },
    },
  },
})

export default meta

export const SystemPrefsWired = /** @type {import('@storybook/react-vite').StoryObj<typeof AccessibilityPlatformProbe>} */ ({
  ...storyDocs(
    [
      '**Why:** Both theme exports must request system reduced-motion, carry',
      'forced-colors overrides, and expose stronger `contrastMore` tokens with',
      'outlined-input media wiring — or Storybook and the app diverge.',
      '**See:** `reducedMotion: system`, `forcedColorsTheme: enhanced`,',
      '`contrastMoreTokens: stronger`, `contrastMoreOutline: wired`.',
    ].join(' ')
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement).toHaveTextContent('reducedMotion: system')
    await expect(canvasElement).toHaveTextContent('forcedColorsTheme: enhanced')
    await expect(canvasElement).toHaveTextContent('contrastMoreTokens: stronger')
    await expect(canvasElement).toHaveTextContent('contrastMoreOutline: wired')
  },
})
