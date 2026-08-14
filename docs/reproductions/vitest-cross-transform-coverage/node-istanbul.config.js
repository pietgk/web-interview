import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['reproduction.test.js'],
    coverage: {
      provider: 'istanbul',
      include: ['imported-call.js', 'named-react-import.js'],
      reporter: ['json'],
      reportsDirectory: 'coverage-node-istanbul',
    },
  },
})
