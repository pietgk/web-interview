import React from 'react'
import { createRoot } from 'react-dom/client'
import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material'
import App from './App.tsx'
import { darkTheme, lightTheme } from './theme.ts'

/**
 * Storybook has always offered both themes; until this existed the product only
 * ever rendered the light one, so dark mode was documented but unreachable.
 * Following the OS keeps that honest without inventing a preference UI.
 *
 * `enableColorScheme` writes `color-scheme` on `html` from `palette.mode`, which
 * is what the browser paints its own widgets from - the date field's picker icon
 * most visibly. The `<meta>` in `index.html` only covers the frames before this
 * mounts, and it defers to the OS rather than to the theme.
 */
const Themed = () => {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)')

  return (
    <ThemeProvider theme={prefersDark ? darkTheme : lightTheme}>
      <CssBaseline enableColorScheme />
      <App />
    </ThemeProvider>
  )
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Missing application root element')
const root = createRoot(rootElement)

root.render(<Themed />)
