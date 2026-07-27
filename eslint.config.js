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
    // Covers .ts AND .tsx: a domain file containing JSX would necessarily be
    // .tsx, and that's exactly the "domain must not depend on React" shape
    // this guard exists to catch.
    files: ['src/domain/**/*.ts', 'src/domain/**/*.tsx'],
    ignores: ['src/domain/**/__tests__/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['react', 'react-dom', 'dexie', 'dexie-react-hooks'], message: 'Domain layer must not depend on React or Dexie.' },
          // '**' added alongside the bare form ('@/data') so a barrel import
          // with no trailing path segment (e.g. `from '@/data'`) is also
          // caught, not just `@/data/<something>`. Verified empirically:
          // ESLint's no-restricted-imports `group` patterns are matched via
          // the `ignore` package (git's ignore semantics), where matching a
          // path segment cascades to everything nested under it — so
          // '@/data/*' already caught deep imports like
          // '@/data/repositories/workoutRepo' despite the single star. The
          // real gap it left open was the bare directory form.
          { group: ['@/data', '@/data/**', '@/features', '@/features/**', '@/components', '@/components/**', '@/hooks', '@/hooks/**'], message: 'Domain layer may only import from @/domain and @/data/types.' },
        ],
      }],
      'no-restricted-syntax': ['error',
        { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: 'Domain must receive `today` as a parameter, not read the clock.' },
        { selector: "CallExpression[callee.object.name='Date'][callee.computed=true][callee.property.value='now']", message: 'Domain must receive `today` as a parameter, not read the clock.' },
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'Domain must receive `today` as a parameter, not read the clock.' },
        { selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']", message: 'Domain must stay deterministic.' },
        { selector: "CallExpression[callee.object.name='Math'][callee.computed=true][callee.property.value='random']", message: 'Domain must stay deterministic.' },
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
