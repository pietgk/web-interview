import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import storybook from 'eslint-plugin-storybook'
import tseslint from 'typescript-eslint'
import {
  namedLiteralOptions,
  semanticConstantsPlugin,
  semanticConstantRules,
} from './scripts/semantic-constants-config.js'

// Every source file in the repo is linted by this one config. It replaced
// per-workspace configs so that a single typescript-eslint - and therefore a
// single parser version - sees the whole tree. TypeScript 7 ships no JS API, so
// the `typescript` specifier resolves to the TS 6 API package while `tsc`
// remains TypeScript 7; a second eslint install would resolve a second parser.
//
// Linting is syntax-only. TypeScript 7 cannot back type-aware rules, and TS 6 is
// present as a parser rather than as a second opinion about types.

/** Every extension this repo executes, so a rename can never silently drop a file from lint. */
const SOURCE = '**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'
const TYPESCRIPT = '**/*.{ts,tsx,mts,cts}'

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

const noDeepTodoImports = { 'no-restricted-imports': ['error', todoSubpathImports] }

// ADR 007: a component reaches the model through events and commands, never
// through datoms. `todos/todoListCommands` is the only module allowed to name
// `ATTRIBUTE`, `client.assert` or `client.retract`.
//
// Stories are exempt because they seed a fake server with literal datoms. That
// is fixture construction, not a component talking to the model.
const datomImport = {
  name: '@web-interview/todos/datom',
  message:
    'ADR 007: components reach the model through commands, not datoms. Use todos/todoListCommands.',
}

// Empty, and staying that way: every component now reaches the model through
// `todoListCommands`. This list existed to hold `TodoLists` while it was
// migrated, as a lockfile rather than a target. Never add an entry.
/** @type {string[]} */
const notYetMigrated = []

// ADR 007, defence 3: only the commands module writes datoms. Matching on the
// property name rather than on `client.assert` catches the aliased and
// destructured forms too. `todoClient` defines these as object properties,
// which is not a member expression, so it needs no exemption.
const datomWrite = {
  selector: 'MemberExpression[property.name=/^(assert|retract)$/]',
  message:
    'ADR 007: only todos/todoListCommands writes datoms. Call a named command instead.',
}

// A dimension written at a call site is a design decision nobody named. The
// semantic-constants standard exempts structural style geometry - a `flexGrow`
// or a `gridColumn` says what it means - but a bare `width: '11rem'` does not.
//
// Only px/rem/em literals are caught. Plain numbers stay legal because on these
// properties MUI already routes them through `theme.spacing`, so they are
// derived rather than invented.
const themedDimension = {
  selector:
    'Property[key.name=/^(width|height|minWidth|maxWidth|minHeight|maxHeight|top|right|bottom|left|gap|columnGap|rowGap|padding|paddingX|paddingY|paddingTop|paddingRight|paddingBottom|paddingLeft|margin|marginX|marginY|marginTop|marginRight|marginBottom|marginLeft|p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml)$/]' +
    ' > Literal[value=/^-?[0-9]*\\.?[0-9]+(px|rem|em)$/]',
  message:
    'Name this dimension in src/theme and read it as theme.todos.*, so the ' +
    'decision lives in one place. See docs/semantic-constants.md.',
}

export default [
  {
    ignores: [
      '**/node_modules/**',
      '.claude/**',
      '.agents/**',
      // Bug reproductions are preserved exactly as they were reported. Their
      // point is to reproduce a tool defect, so linting or autofixing them
      // would destroy the evidence.
      'docs/reproductions/**',
      'coverage/**',
      '.coverage-reports/**',
      '.vitest-reports/**',
      '.test-evidence/**',
      'lighthouse-reports/**',
      'test-results/**',
      'shared/dist/**',
      'frontend/dist/**',
      'frontend/build/**',
      'frontend/storybook-static/**',
    ],
  },
  js.configs.recommended,

  // Syntax-only TypeScript rules. Scoped to TypeScript files so the JavaScript
  // that has not been converted yet keeps its existing treatment exactly.
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: [TYPESCRIPT] })),
  {
    files: [TYPESCRIPT],
    rules: {
      // Replaces the no-`any`-in-emitted-declarations gate, and covers all
      // source rather than only what reaches a `.d.ts`.
      '@typescript-eslint/no-explicit-any': 'error',
      // Type stripping is per-file, so an unmarked type import survives erasure
      // and fails at runtime with a SyntaxError that typecheck cannot see.
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },

  // Node scope: the shared domain package, the repo scripts, the Playwright
  // suite, the backend, and the root config files.
  {
    files: [
      'shared/src/**/*.{js,mjs,ts,mts}',
      'backend/src/**/*.{js,mjs,ts,mts}',
      'scripts/**/*.{js,mjs,ts,mts}',
      'e2e/**/*.{js,mjs,ts,mts}',
      'type-tests/**/*.{ts,mts}',
      '*.{js,mjs,ts,mts}',
      // Build and test configuration for every workspace runs in Node.
      '{shared,backend,frontend}/*.config.{js,mjs,ts,mts}',
      'frontend/.storybook/main.{js,mjs,ts,mts}',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    plugins: { 'semantic-constants': semanticConstantsPlugin },
    rules: {
      ...noDeepTodoImports,
      ...semanticConstantRules(),
      // `const { omitted, ...rest } = value` is how this codebase drops a key.
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  {
    // Numeric literals are the grammar of these AST/geometry-heavy files. Their
    // surrounding syntax already supplies the clearest meaning; date and
    // canonical-contract enforcement remain enabled.
    files: [
      'scripts/eslint-plugin-semantic-constants.{js,ts}',
      'scripts/generate-architecture-board.{js,ts}',
    ],
    rules: semanticConstantRules(namedLiteralOptions({ numbers: false })),
  },
  {
    // Callbacks passed to `page.evaluate` are serialised and run in the browser,
    // so they legitimately reach for DOM and Performance globals.
    files: ['e2e/**/*.{js,mjs,ts,mts}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },

  // Browser scope: the frontend application and its stories. Frontend build and
  // Storybook *configuration* runs in Node, so it is excluded here and given
  // Node globals below.
  {
    files: ['frontend/**/*.{js,jsx,mjs,ts,tsx,mts}'],
    ignores: [
      'frontend/*.config.{js,mjs,ts,mts}',
      'frontend/.storybook/main.{js,mjs,ts,mts}',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'semantic-constants': semanticConstantsPlugin,
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...semanticConstantRules(),
      'no-restricted-imports': ['error', todoSubpathImports],
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },
  {
    // ADR 007, defence 3: no component imports the datom vocabulary.
    files: ['frontend/src/todos/components/**/*.{js,jsx,ts,tsx}'],
    ignores: ['frontend/src/todos/components/**/*.stories.{jsx,tsx}', ...notYetMigrated],
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
    files: ['frontend/src/**/*.{js,jsx,ts,tsx}'],
    ignores: ['frontend/src/todos/todoListCommands.{js,ts}', ...notYetMigrated],
    rules: { 'no-restricted-syntax': ['error', datomWrite, themedDimension] },
  },
  {
    // The commands module is the one file allowed to write datoms, but nothing
    // exempts it from naming its dimensions. A flat-config block can only
    // replace `no-restricted-syntax` wholesale, so it gets its own list.
    files: ['frontend/src/todos/todoListCommands.{js,ts}'],
    rules: { 'no-restricted-syntax': ['error', themedDimension] },
  },
  {
    files: ['**/*.{test,spec}.{js,jsx,mjs,ts,tsx,mts}'],
    languageOptions: {
      globals: {
        ...globals.node,
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
  ...storybook.configs['flat/recommended'],

  // Keeps the source glob referenced so the lint-scope guard and this config
  // agree on what "a source file" means.
  { files: [SOURCE], rules: {} },
]
