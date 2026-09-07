// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

/**
 * The rules engine must stay pure and deterministic: given the same state,
 * action and seeded RNG it has to produce byte-identical output on the server
 * and on every client. Ambient nondeterminism (wall-clock time, unseeded
 * randomness) or I/O would silently desync the two. These restrictions are the
 * mechanical half of that guarantee - see docs/rules-spec.md for the rest.
 */
/** @type {import('eslint').Linter.RulesRecord} */
const ENGINE_PURITY_RULES = {
  'no-restricted-syntax': [
    'error',
    {
      selector: "MemberExpression[object.name='Math'][property.name='random']",
      message:
        'The engine must be deterministic. Take a SeededRng parameter instead of Math.random().',
    },
    {
      selector: "MemberExpression[object.name='Date'][property.name='now']",
      message:
        'The engine must be deterministic. Pass timestamps in on the action instead of reading the clock.',
    },
    {
      selector: "NewExpression[callee.name='Date']",
      message:
        'The engine must be deterministic. Pass timestamps in on the action instead of reading the clock.',
    },
    {
      selector: "CallExpression[callee.name='setTimeout']",
      message: 'The engine is synchronous and pure - no timers.',
    },
  ],
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: ['node:*', 'fs', 'path', 'crypto', 'http', 'https', 'os', 'child_process'],
          message:
            'The engine performs no I/O. Keep platform access in apps/server or apps/client.',
        },
      ],
    },
  ],
}

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'docs/reference/**',
      // Vendored third-party skills - not our code to lint.
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // Config files are plain JS; type-aware rules have nothing to work with.
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['packages/engine/**/*.ts', 'packages/cards/**/*.ts'],
    rules: ENGINE_PURITY_RULES,
  },
  {
    // Tests may reach for the clock and real randomness.
    files: ['**/*.test.ts', '**/test/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
      'no-restricted-imports': 'off',
    },
  },
)
