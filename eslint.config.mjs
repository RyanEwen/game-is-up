import js from '@eslint/js'
import globals from 'globals'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.vite/**',
      '**/coverage/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Native alert, confirm and prompt dialogs break the app's Back-aware modal convention.
      'no-alert': 'error',
    },
  },
  // The API logs through its logger module (LOG-3); only that module writes to the console.
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: ['apps/api/src/lib/logger.ts', 'apps/api/src/**/*.test.ts'],
    rules: {
      'no-console': 'error',
    },
  },
  // Accessibility baseline for the web app (UI-14): accessible names, valid ARIA, keyboard reach.
  {
    ...jsxA11y.flatConfigs.recommended,
    files: ['apps/web/**/*.tsx'],
  },
)
