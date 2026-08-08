import js from '@eslint/js'
import globals from 'globals'
import {
  namedLiteralOptions,
  semanticConstantsPlugin,
  semanticConstantRules,
} from './scripts/semantic-constants-config.mjs'

const noDeepTodoImports = {
  'no-restricted-imports': [
    'error',
    {
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
    },
  ],
}

// Covers what `backend/eslint.config.js` and `frontend/eslint.config.js` do not:
// the shared domain package, the repo scripts, the Playwright suite, and the
// root config files. Lint scope matches typecheck scope.
export default [
  {
    ignores: [
      'node_modules/**',
      'backend/**',
      'frontend/**',
      'lighthouse-reports/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['shared/src/**/*.js', 'scripts/**/*.mjs', 'e2e/**/*.js', '*.js', '*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    plugins: {
      'semantic-constants': semanticConstantsPlugin,
    },
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
      'scripts/eslint-plugin-semantic-constants.mjs',
      'scripts/generate-architecture-board.mjs',
    ],
    rules: semanticConstantRules(namedLiteralOptions({ numbers: false })),
  },
  {
    // Callbacks passed to `page.evaluate` are serialised and run in the browser,
    // so they legitimately reach for DOM and Performance globals.
    files: ['e2e/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
]
