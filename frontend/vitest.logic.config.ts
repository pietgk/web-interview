import { defineConfig } from 'vitest/config'

// The `frontend` project owns non-UI logic only: models, UI state, and the fake
// datom server. Components are proven by stories, not here (see ADR 006).
export default defineConfig({
  // Logic tests do not transform React components or serve the app. Loading the
  // browser Vite config here gives the two coverage producers different AST maps.
  resolve: {
    dedupe: ['zod', 'react', 'react-dom'],
  },
  test: {
    name: 'frontend',
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    server: {
      deps: {
        inline: [/^@web-interview\/todos(?:\/|$)/, 'zod'],
      },
    },
  },
})
