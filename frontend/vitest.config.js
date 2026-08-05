import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.js'

// The `frontend` project owns non-UI logic only: models, UI state, and the fake
// datom server. Components are proven by stories, not here (see ADR 006).
export default mergeConfig(
  viteConfig,
  defineConfig({
    // Nothing here serves the app; never let the dev server's `open` leak in.
    server: { open: false },
    test: {
      name: 'frontend',
      environment: 'happy-dom',
      globals: true,
      include: ['src/**/*.{test,spec}.{js,jsx}'],
      server: {
        deps: {
          inline: [/^@web-interview\/todos(?:\/|$)/, 'zod'],
        },
      },
    },
  })
)
