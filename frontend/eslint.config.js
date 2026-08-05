// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

const todoSubpathImports = {
  paths: [
    {
      name: '@web-interview/todos',
      message: 'Import from an explicit @web-interview/todos subpath.',
    },
  ],
  patterns: [
    {
      group: ['@web-interview/todos/src', '@web-interview/todos/src/*'],
      message: 'Import from a public @web-interview/todos subpath.',
    },
  ],
}

// ADR 007: a component reaches the model through events and commands, never
// through datoms. `todos/todoListCommands.js` is the only module allowed to name
// `ATTRIBUTE`, `client.assert` or `client.retract`.
//
// Stories are exempt because they seed a fake server with literal datoms. That
// is fixture construction, not a component talking to the model.
const datomImport = {
  name: '@web-interview/todos/datom',
  message:
    'ADR 007: components reach the model through commands, not datoms. Use todos/todoListCommands.js.',
}

// The one file ADR 007 has not migrated yet. This list is a lockfile, not a
// target, in the same sense as the coverage thresholds in `vitest.config.js`: it
// records what is true today so the gate lands green and can only ratchet down.
// Never add an entry. Emptying it completes ADR 007.
const notYetMigrated = ['src/todos/components/TodoLists.jsx']

export default [
  { ignores: ['dist/**', 'build/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'no-restricted-imports': ['error', todoSubpathImports],
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
  {
    // ADR 007, defence 3: no component imports the datom vocabulary.
    files: ['src/todos/components/**/*.{js,jsx}'],
    ignores: ['src/todos/components/**/*.stories.jsx', ...notYetMigrated],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [...todoSubpathImports.paths, datomImport],
          patterns: todoSubpathImports.patterns,
        },
      ],
    },
  },
  {
    // ADR 007, defence 3: only the commands module writes datoms. Matching on
    // the property name rather than on `client.assert` catches the aliased and
    // destructured forms too. `todoClient.js` defines these as object
    // properties, which is not a member expression, so it needs no exemption.
    files: ['src/**/*.{js,jsx}'],
    ignores: ['src/todos/todoListCommands.js', ...notYetMigrated],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MemberExpression[property.name=/^(assert|retract)$/]',
          message:
            'ADR 007: only todos/todoListCommands.js writes datoms. Call a named command instead.',
        },
      ],
    },
  },
  {
    files: ['**/*.{test,spec}.{js,jsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        vi: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        global: 'readonly',
      },
    },
  },
  ...storybook.configs["flat/recommended"]
];
