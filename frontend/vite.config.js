import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: './src/setupTests.js',
    server: {
      deps: {
        inline: ['@web-interview/todo-contract', 'zod', 'xstate', '@xstate/react'],
      },
    },
  },
})
