import React from 'react'
import { createRoot } from 'react-dom/client'
import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material'
import App from './App'
import { darkTheme, lightTheme } from './theme'

/**
 * Storybook has always offered both themes; until this existed the product only
 * ever rendered the light one, so dark mode was documented but unreachable.
 * Following the OS keeps that honest without inventing a preference UI.
 */
const Themed = () => {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)')

  return (
    <ThemeProvider theme={prefersDark ? darkTheme : lightTheme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  )
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Missing application root element')
const root = createRoot(rootElement)

root.render(<Themed />)
