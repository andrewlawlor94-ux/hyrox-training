import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'coverage', 'playwright-report', 'test-results', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: { project: ['./tsconfig.app.json'], tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-magic-numbers': ['warn', { ignore: [0, 1, -1, 2, 100], ignoreArrayIndexes: true, enforceConst: true }],
    },
  },
  {
    // Purity guard: the domain layer must stay pure and clock-free.
    files: ['src/domain/**/*.ts'],
    ignores: ['src/domain/**/__tests__/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['react', 'react-dom', 'dexie', 'dexie-react-hooks'], message: 'Domain layer must not depend on React or Dexie.' },
          { group: ['@/data/*', '@/features/*', '@/components/*', '@/hooks/*'], message: 'Domain layer may only import from @/domain and @/data/types.' },
        ],
      }],
      'no-restricted-syntax': ['error',
        { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: 'Domain must receive `today` as a parameter, not read the clock.' },
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'Domain must receive `today` as a parameter, not read the clock.' },
        { selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']", message: 'Domain must stay deterministic.' },
      ],
    },
  },
  {
    files: ['**/__tests__/**', 'src/data/seed/**'],
    rules: {
      'no-magic-numbers': 'off',
    },
  },
  { files: ['scripts/**/*.mjs', '*.config.{ts,js}'], languageOptions: { globals: globals.node } },
)
