import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'html', 'json-summary'],
      // ROADMAP §10: ranking engine ≥ 95% line coverage; branches are checked too.
      thresholds: { lines: 95, branches: 90 },
    },
  },
})
