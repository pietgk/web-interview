import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { DATOM_API_PATH } from '@web-interview/todos/protocol'

const DEVELOPMENT_PORT = Number(process.env.VITE_DEV_PORT ?? 3000)
const API_PROXY_TARGET =
  process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3001'
const API_PROXY = {
  [DATOM_API_PATH.ROOT]: API_PROXY_TARGET,
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['zod'],
  },
  server: {
    port: DEVELOPMENT_PORT,
    open: true,
    proxy: API_PROXY,
  },
  preview: {
    proxy: API_PROXY,
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: './src/setupTests.js',
    server: {
      deps: {
        inline: [/^@web-interview\/todos(?:\/|$)/, 'zod'],
      },
    },
  },
})
