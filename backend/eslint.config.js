import js from '@eslint/js'
import globals from 'globals'

export default [
  { ignores: ['node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
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
    },
  },
]
