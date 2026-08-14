import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['reproduction.test.js'],
    coverage: {
      provider: 'istanbul',
      include: ['imported-call.js', 'named-react-import.js'],
      reporter: ['json'],
      reportsDirectory: 'coverage-browser-istanbul',
    },
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({}),
      instances: [{ browser: 'chromium' }],
    },
  },
})
