import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { DATOM_API_PATH } from '@web-interview/todos/protocol'

const DEVELOPMENT_PORT = Number(process.env.VITE_DEV_PORT ?? 3000)
const API_PROXY_TARGET =
  process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3001'
const API_PROXY = {
  [DATOM_API_PATH.ROOT]: API_PROXY_TARGET,
}

// Storybook/Vite write under these paths during a run; watching them re-triggers Vitest.
const WATCH_IGNORED = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.cache/**',
  '**/node_modules/.cache/**',
]

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['zod', 'react', 'react-dom'],
  },
  server: {
    port: DEVELOPMENT_PORT,
    open: true,
    proxy: API_PROXY,
    watch: {
      ignored: WATCH_IGNORED,
    },
  },
  preview: {
    proxy: API_PROXY,
  },
})
