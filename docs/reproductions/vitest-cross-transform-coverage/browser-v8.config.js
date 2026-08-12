import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['reproduction.test.js'],
    coverage: {
      provider: 'v8',
      include: ['imported-call.js', 'named-react-import.js'],
      reporter: ['json'],
      reportsDirectory: 'coverage-browser',
    },
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({}),
      instances: [{ browser: 'chromium' }],
    },
  },
})
