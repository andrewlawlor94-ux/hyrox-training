import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  // '.claude/worktrees/**' matters beyond tidiness: a concurrent session's
  // git worktree can live nested inside this one's own root, with its own
  // tsconfig-relative file set — without this, typescript-eslint's
  // "parserOptions.project" tries to type-check those files against THIS
  // worktree's tsconfig and fails on every one of them.
  { ignores: ['dist', 'dev-dist', 'coverage', 'playwright-report', 'test-results', 'node_modules', '.claude/worktrees/**'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      // tsconfig.node.json covers playwright.config.ts and e2e/**/*.ts (see
      // that file's own doc comment) -- without it here too, typescript-eslint
      // can't find those files in ANY configured project and hard-errors on
      // every one of them ("file was not found in any of the provided
      // project(s)").
      parserOptions: { project: ['./tsconfig.app.json', './tsconfig.node.json'], tsconfigRootDir: import.meta.dirname },
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
    // The one sanctioned exception to the block above: src/domain/types.ts
    // is the re-export barrel (Task 3) that lets the rest of the domain
    // layer use entity types without reaching into @/data directly — see the
    // comment in the previous block. `no-restricted-imports` applies to
    // `export ... from` declarations, not just `import` statements, so the
    // barrel's own `export type * from '@/data/types'` would otherwise trip
    // the same rule it exists to route around. This override re-declares the
    // same restriction with a single negation (`!@/data/types`, gitignore-
    // style via the `ignore` package) so only that one path is unblocked,
    // only for this one file — every other domain file is still fully
    // covered by the block above and must import entity types via
    // `@/domain/types`, not `@/data/types` directly.
    //
    // The bare form (`@/data`) has to move into `paths` (exact-match, not
    // glob) rather than staying in the `group` array: verified empirically
    // that when a bare directory pattern like `@/data` sits alongside
    // `@/data/**` in the same `group`, the `ignore` package's gitignore
    // semantics treat `@/data` as excluding the whole directory, and a
    // negation can never re-include a path under an already-excluded parent
    // — so `!@/data/types` was silently ignored. Splitting the exact bare
    // form into `paths` (plain string equality, no cascade) sidesteps that
    // rule entirely.
    files: ['src/domain/types.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: '@/data', message: 'The barrel may only import @/data/types.' },
        ],
        patterns: [
          { group: ['react', 'react-dom', 'dexie', 'dexie-react-hooks'], message: 'Domain layer must not depend on React or Dexie.' },
          { group: ['@/data/**', '!@/data/types', '@/features', '@/features/**', '@/components', '@/components/**', '@/hooks', '@/hooks/**'], message: 'The barrel may only import @/data/types.' },
        ],
      }],
    },
  },
  {
    files: ['**/__tests__/**', 'src/data/seed/**'],
    rules: {
      'no-magic-numbers': 'off',
    },
  },
  // e2e/**/*.ts runs under Node (the Playwright test runner), not a browser,
  // so it needs `globals.node` (e.g. `Buffer`) the same way scripts/*.mjs and
  // the *.config files do.
  { files: ['scripts/**/*.mjs', '*.config.{ts,js}', 'e2e/**/*.ts'], languageOptions: { globals: globals.node } },
)
