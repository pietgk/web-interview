import React from 'react'
import { createRoot } from 'react-dom/client'
import { CssBaseline, ThemeProvider } from '@mui/material'
import App from './App'
import { lightTheme } from './theme'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Missing application root element')
const root = createRoot(rootElement)

root.render(
  <ThemeProvider theme={lightTheme}>
    <CssBaseline />
    <App />
  </ThemeProvider>
)
