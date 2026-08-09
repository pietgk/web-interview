import { withThemeFromJSXProvider } from '@storybook/addon-themes'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { darkTheme, lightTheme } from '../src/theme'

/**
 * `withThemeFromJSXProvider` renders `GlobalStyles` with no props, so the
 * `enableColorScheme` the app passes in `index.jsx` has to come from a wrapper.
 * Without it `html` stays at `color-scheme: normal` and the browser paints its
 * own widgets light under the dark theme - the date field's picker icon lands as
 * a near-black glyph on a near-black card.
 */
const ColorSchemedBaseline = () => <CssBaseline enableColorScheme />

/** @type { import('@storybook/react-vite').Preview } */
const preview = {
  // Generate a Docs page for every story file (same as tags: ['autodocs'] on each meta).
  tags: ['autodocs'],
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
  ],
}

export default preview
