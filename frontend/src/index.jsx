import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ensureInspector } from './todos/inspect'

const root = createRoot(document.getElementById('root'))

ensureInspector().finally(() => {
  root.render(<App />)
})
