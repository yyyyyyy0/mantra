import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'scripts/lib/agent-schema.ts',
        'scripts/lib/rule-parser.ts',
        'scripts/lib/rule-schema.ts',
        'scripts/lib/validation-summary.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
})
