import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**'],
  },
  {
    files: ['scripts/**/*.ts', 'tests/**/*.ts', 'vitest.config.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
  },
)
