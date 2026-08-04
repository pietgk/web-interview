import { withThemeFromJSXProvider } from '@storybook/addon-themes'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { darkTheme, lightTheme } from '../src/theme'

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
      // Flip to 'error' when the inventory is green (violations only).
      test: 'todo',
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
      GlobalStyles: CssBaseline,
    }),
  ],
}

export default preview
