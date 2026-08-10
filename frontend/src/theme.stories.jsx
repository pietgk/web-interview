import React from 'react'
import { useTheme } from '@mui/material/styles'
import { expect } from 'storybook/test'

/** @param {string} story */
const storyDocs = (story) => ({
  parameters: {
    docs: {
      description: { story },
    },
  },
})

/**
 * Theme platform contracts for OS accessibility prefs (ADR 009 / prefs plan).
 * Light and dark both go through `enhanceHighContrast` and
 * `motion.reducedMotion: 'system'` in `theme.js`; Storybook's theme toolbar
 * swaps which export is active.
 */
const AccessibilityPlatformProbe = () => {
  const theme = useTheme()
  const hasForcedColorsOverride = Boolean(
    theme.components?.MuiListItemButton?.styleOverrides?.root
  )

  return (
    <div>
      <p>{`reducedMotion: ${theme.motion?.reducedMotion ?? 'missing'}`}</p>
      <p>
        {`forcedColorsTheme: ${hasForcedColorsOverride ? 'enhanced' : 'missing'}`}
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
          'Proves the shared light/dark themes honor OS motion and forced-colors',
          'hooks from Material UI 9.1+ (`motion.reducedMotion: system`,',
          '`enhanceHighContrast`). Media emulation itself is covered by Playwright.',
        ].join(' '),
      },
    },
  },
})

export default meta

export const SystemPrefsWired = /** @type {import('@storybook/react-vite').StoryObj<typeof AccessibilityPlatformProbe>} */ ({
  ...storyDocs(
    [
      '**Why:** Both theme exports must request system reduced-motion and carry',
      'forced-colors component overrides, or Storybook and the app diverge.',
      '**See:** `reducedMotion: system` and `forcedColorsTheme: enhanced`.',
    ].join(' ')
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement).toHaveTextContent('reducedMotion: system')
    await expect(canvasElement).toHaveTextContent('forcedColorsTheme: enhanced')
  },
})
