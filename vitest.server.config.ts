import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'server',
    environment: 'node',
    include: ['tests/server/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['server/**/*.ts'],
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage/server',
      thresholds: { lines: 75, functions: 75, branches: 75, statements: 75 },
    },
  },
})
