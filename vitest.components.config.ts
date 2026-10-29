import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '#shared': fileURLToPath(new URL('./shared', import.meta.url)) } },
  test: {
    name: 'components',
    environment: 'jsdom',
    include: ['tests/components/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['app/**/*.vue', 'app/**/*.ts', 'shared/**/*.ts'],
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage/components',
      thresholds: { lines: 25, functions: 25, branches: 25, statements: 25 },
    },
  },
})
