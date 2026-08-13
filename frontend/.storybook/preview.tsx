import { withThemeFromJSXProvider } from '@storybook/addon-themes'
import { CssBaseline, ThemeProvider } from '@mui/material'
import type { Preview } from '@storybook/react-vite'
import { darkTheme, lightTheme } from '../src/theme'
import {
  FORCED_COLORS,
  OS_MEDIA_FEATURE_VALUES,
  OS_MEDIA_PREF_SYSTEM,
  PREFERS_CONTRAST,
  PREFERS_REDUCED_MOTION,
} from './osMediaPrefs.ts'
import { withOsMediaPrefs } from './withOsMediaPrefs.tsx'

/**
 * `withThemeFromJSXProvider` renders `GlobalStyles` with no props, so the
 * `enableColorScheme` the app passes in `index.jsx` has to come from a wrapper.
 * Without it `html` stays at `color-scheme: normal` and the browser paints its
 * own widgets light under the dark theme - the date field's picker icon lands as
 * a near-black glyph on a near-black card.
 */
const ColorSchemedBaseline = () => <CssBaseline enableColorScheme />

const osMediaPrefToolbar = (
  feature: string,
  title: string,
  icon: 'lightning' | 'contrast' | 'accessibility'
) => ({
  description: `Emulate CSS ${feature} (Storybook ergonomics; gates stay Playwright + preference stories)`,
  toolbar: {
    title,
    icon,
    items: [
      { value: OS_MEDIA_PREF_SYSTEM, title: `${title}: system` },
      ...OS_MEDIA_FEATURE_VALUES[feature].map((value) => ({
        value,
        title: `${title}: ${value}`,
      })),
    ],
    dynamicTitle: true,
  },
})

const preview: Preview = {
  // Generate a Docs page for every story file (same as tags: ['autodocs'] on each meta).
  tags: ['autodocs'],
  globalTypes: {
    prefersReducedMotion: osMediaPrefToolbar(
      PREFERS_REDUCED_MOTION,
      'Motion',
      'lightning'
    ),
    prefersContrast: osMediaPrefToolbar(PREFERS_CONTRAST, 'Contrast', 'contrast'),
    forcedColors: osMediaPrefToolbar(FORCED_COLORS, 'Forced colors', 'accessibility'),
  },
  initialGlobals: {
    prefersReducedMotion: OS_MEDIA_PREF_SYSTEM,
    prefersContrast: OS_MEDIA_PREF_SYSTEM,
    forcedColors: OS_MEDIA_PREF_SYSTEM,
  },
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // Violations fail the build. The story inventory was green when this was
      // turned on, and keeping it on is what stops the next story regressing it.
      test: 'error',
      config: {
        rules: [
          {
            // MUI outlined inputs stack fieldset/notch/label over the <input>, so axe
            // cannot measure contrast ("overlapped by another element" → Incomplete).
            // Keep color-contrast for everything else; do not disable the rule globally.
            id: 'color-contrast',
            selector: ':not(.MuiOutlinedInput-input)',
          },
        ],
      },
    },
  },
  decorators: [
    withThemeFromJSXProvider({
      themes: {
        light: lightTheme,
        dark: darkTheme,
      },
      defaultTheme: 'light',
      Provider: ThemeProvider,
      GlobalStyles: ColorSchemedBaseline,
    }),
    // Inside the theme provider so Emotion sheets exist before CSSOM rewrite.
    withOsMediaPrefs,
  ],
}

export default preview
