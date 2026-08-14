import semanticConstants from './eslint-plugin-semantic-constants.ts'

export const semanticConstantsPlugin = semanticConstants

export const namedLiteralOptions = (overrides = {}) => ({
  stringPatterns: [
    { category: 'calendar date', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
  ],
  categoryNamePattern: [
    'advance', 'attempt', 'bit', 'byte', 'code', 'count', 'date', 'day', 'delay',
    'deadline', 'duration', 'epoch', 'gap', 'height', 'horizon', 'hour', 'index', 'interval',
    'length', 'limit', 'margin', 'max', 'millisecond', 'min', 'minute', 'month',
    'ms', 'offset', 'opacity', 'padding', 'percent', 'port', 'position', 'ratio',
    'run', 'second', 'seed', 'size', 'status', 'threshold', 'time', 'timeout',
    'tolerance', 'today', 'tomorrow', 'width', 'year',
  ].join('|'),
  deniedNames: ['value', 'constant', 'number', 'string', 'date', 'testDate'],
  ignoredNumbers: [-1, 0, 1],
  structuralMatchers: [
    'toHaveLength',
    'toHaveBeenCalledTimes',
    'toHaveBeenNthCalledWith',
  ],
  observationMatchers: ['toBe', 'toEqual'],
  sensitiveCalls: [
    '^(?:Date|UTC|advance|advanceTimersByTimeAsync|exit|padStart|repeat|setTimeout|waitForTimeout|writeHead)$',
  ],
  sensitiveIdentifiers: ['port', 'timeoutMs'],
  sensitiveProperties: ['heartbeatMs', 'maxLength', 'port', 'status', 'timeout'],
  ...overrides,
})

export const canonicalContractOptions = {
  contracts: [
    {
      id: 'todoTextMaximumLength',
      module: '@web-interview/todos/protocol',
      export: 'TODO_TEXT_MAX_LENGTH',
    },
    {
      id: 'todoListTitleMaximumLength',
      module: '@web-interview/todos/protocol',
      export: 'TODO_LIST_TITLE_MAX_LENGTH',
    },
  ],
  usageMappings: [
    {
      filePattern: '/Todo(?:Composer|Item)(?:\\.stories)?\\.[jt]sx$',
      usages: ['maxLength property', 'maxlength DOM assertion'],
      contract: 'todoTextMaximumLength',
    },
    {
      filePattern: '/TodoListTitleField(?:\\.stories)?\\.[jt]sx$',
      usages: ['maxLength property', 'maxlength DOM assertion'],
      contract: 'todoListTitleMaximumLength',
    },
    {
      identifierPattern: '^(?:TODO_)?(?:TEXT_)?MAX_LENGTH$',
      exceptFilePattern: '/shared/src/todoProtocol\\.[jt]s$',
      usages: [],
      contract: 'todoTextMaximumLength',
    },
  ],
}

export const semanticConstantRules = (namedOptions = namedLiteralOptions()) => ({
  'semantic-constants/require-named-literal': ['error', namedOptions],
  'semantic-constants/require-canonical-contract': ['error', canonicalContractOptions],
})
