// ESLint flat config — TypeScript strict + the local `eduway` plugin enforcing the shared-DB prefix policy.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import noUnprefixedSql from './eslint-rules/no-unprefixed-sql.mjs';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'docs/openapi.json'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.mjs', '**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    plugins: { eduway: { rules: { 'no-unprefixed-sql': noUnprefixedSql } } },
    rules: {
      'eduway/no-unprefixed-sql': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'off',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
    },
  },
  {
    // The rule's own fixtures / the core library contain example violations by design.
    files: ['tools/**', 'eslint-rules/**', 'tests/unit/prefix-lint.test.ts'],
    rules: { 'eduway/no-unprefixed-sql': 'off' },
  },
);
