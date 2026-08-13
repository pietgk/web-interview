// ESLint's Rule.Node is a closed ESTree union. This plugin walks a looser tree
// (including JSX) and cannot use that union without lying at every property access.
import type { ESLint, Rule } from 'eslint'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ESLint AST escape hatch
export type AstNode = Record<string, any>

export type ContractDefinition = { id: string; module: string; export: string }
export type UsageMapping = {
  usages?: string[]
  filePattern?: string
  contract?: string
  identifierPattern?: string
  exceptFilePattern?: string
}
export type RuleOptions = {
  stringPatterns?: Array<{ category?: string; pattern?: string }>
  categoryNamePattern?: string
  deniedNames?: string[]
  ignoredNumbers?: number[]
  structuralMatchers?: string[]
  observationMatchers?: string[]
  sensitiveCalls?: string[]
  sensitiveIdentifiers?: string[]
  sensitiveProperties?: string[]
  numbers?: boolean
  contracts?: ContractDefinition[]
  usageMappings?: UsageMapping[]
}

type ReportDescriptor = { node: AstNode; messageId: string; data?: Record<string, string> }
interface PluginRuleContext {
  options: RuleOptions[]
  filename: string
  // eslint-disable-next-line no-unused-vars -- parameter name in a type-level method signature
  report(info: ReportDescriptor): void
}

const getPropertyName = (node: AstNode | null | undefined) => {
  if (!node) return null
  if (!node.computed && node.property?.type === 'Identifier') return node.property.name
  if (node.property?.type === 'Literal' && typeof node.property.value === 'string') {
    return node.property.value
  }
  return null
}

const getObjectPropertyName = (node: AstNode | null | undefined) => {
  if (!node || node.type !== 'Property') return null
  if (!node.computed && node.key.type === 'Identifier') return node.key.name
  if (node.key.type === 'Literal' && typeof node.key.value === 'string') return node.key.value
  return null
}

const getBindingName = (node: AstNode | null | undefined) => node?.type === 'Identifier' ? node.name : null

const normaliseName = (name: string) => name.replaceAll('_', '').toLowerCase()

const isFunction = (node: AstNode) =>
  node.type === 'ArrowFunctionExpression' ||
  node.type === 'FunctionExpression' ||
  node.type === 'FunctionDeclaration'

const expressionMayBelongToBinding = (node: AstNode) =>
  node.type === 'BinaryExpression' ||
  node.type === 'UnaryExpression' ||
  node.type === 'LogicalExpression' ||
  node.type === 'ConditionalExpression' ||
  node.type === 'CallExpression' ||
  node.type === 'NewExpression' ||
  node.type === 'MemberExpression' ||
  node.type === 'ChainExpression' ||
  node.type === 'TemplateLiteral' ||
  node.type === 'TaggedTemplateExpression'

const owningConst = (node: AstNode) => {
  let current = node
  while (current.parent) {
    const parent = current.parent
    if (
      parent.type === 'VariableDeclarator' &&
      parent.init === current &&
      parent.parent?.kind === 'const'
    ) {
      return parent
    }
    if (isFunction(parent) || !expressionMayBelongToBinding(parent)) return null
    current = parent
  }
  return null
}

const numericExpressionRoot = (node: AstNode) => {
  let current = node
  while (
    current.parent?.type === 'BinaryExpression' ||
    current.parent?.type === 'UnaryExpression'
  ) {
    current = current.parent
  }
  return current
}

const numericValue = (node: AstNode) => {
  if (node.type === 'Literal' && typeof node.value === 'number') return node.value
  if (
    node.type === 'UnaryExpression' &&
    (node.operator === '-' || node.operator === '+') &&
    node.argument.type === 'Literal' &&
    typeof node.argument.value === 'number'
  ) {
    return node.operator === '-' ? -node.argument.value : node.argument.value
  }
  return null
}

const callName = (node: AstNode | null | undefined) => {
  if (node?.type !== 'CallExpression') return null
  if (node.callee.type === 'Identifier') return node.callee.name
  if (node.callee.type === 'MemberExpression') return getPropertyName(node.callee)
  return null
}

const isSensitiveCall = (node: AstNode, patterns: string[]) => {
  const name = callName(node)
  return name !== null && patterns.some((pattern) =>
    new RegExp(pattern).test(name)
  )
}

const enclosingCallArgument = (node: AstNode) => {
  let current = node
  while (current.parent && !isFunction(current.parent)) {
    const parent = current.parent
    if (
      (parent.type === 'CallExpression' || parent.type === 'NewExpression') &&
      parent.arguments.includes(current)
    ) {
      return { call: parent, argument: current }
    }
    if (!expressionMayBelongToBinding(parent)) return null
    current = parent
  }
  return null
}

const expectSubject = (matcherCall: AstNode) => {
  const member = matcherCall.callee
  if (member.type !== 'MemberExpression') return null
  const expectCall = member.object
  if (expectCall.type !== 'CallExpression' || callName(expectCall) !== 'expect') return null
  return expectCall.arguments[0] ?? null
}

const isSensitiveSubject = (subject: AstNode | null | undefined, sensitiveProperties: Set<string>) => {
  if (subject?.type === 'CallExpression') return true
  if (subject?.type === 'MemberExpression') {
    return sensitiveProperties.has(getPropertyName(subject))
  }
  return false
}

const isStructuralNumber = (node: AstNode, options: RuleOptions) => {
  const parent = node.parent
  const sensitiveProperties = new Set(options.sensitiveProperties ?? [])
  const sensitiveIdentifiers = new Set(options.sensitiveIdentifiers ?? [])

  if (parent?.type === 'VariableDeclarator' && parent.init === node) return false
  if (parent?.type === 'MemberExpression' && parent.computed && parent.property === node) return true
  if (parent?.type === 'ArrayExpression') return true
  if (parent?.type === 'Property') {
    return !sensitiveProperties.has(getObjectPropertyName(parent))
  }
  if (parent?.type === 'JSXExpressionContainer') return true
  if (parent?.type === 'AssignmentPattern' && parent.right === node) {
    return getBindingName(parent.left) !== null
  }

  if (parent?.type === 'BinaryExpression') {
    const other = parent.left === node ? parent.right : parent.left
    if (other.type === 'MemberExpression' && getPropertyName(other) === 'length') return true
    if (other.type === 'Identifier' && /(?:count|index|position)$/i.test(other.name)) return true
    if (other.type === 'Identifier' && sensitiveIdentifiers.has(other.name)) return false
    return true
  }

  const argument = enclosingCallArgument(node)
  if (!argument || argument.call.type !== 'CallExpression') return true
  const matcher = callName(argument.call)
  if ((options.structuralMatchers ?? []).includes(matcher)) return true
  if ((options.observationMatchers ?? []).includes(matcher)) {
    const subject = expectSubject(argument.call)
    return subject !== null && !isSensitiveSubject(subject, sensitiveProperties)
  }
  return !isSensitiveCall(argument.call, options.sensitiveCalls ?? [])
}

const requireNamedLiteral = {
  meta: {
    type: 'problem',
    schema: [{ type: 'object', additionalProperties: true }],
    messages: {
      date: 'Name this {{category}} with a descriptive const. Executable {{category}} literals hide scenario meaning.',
      number: 'Name this behavior or representation number with a descriptive const that owns the complete expression.',
      name: 'Rename "{{name}}" to state the scenario meaning and include a category such as day, time, length, limit, timeout, or count.',
    },
  },
  create(context: PluginRuleContext) {
    const options = context.options[0] ?? {}
    const patterns = (options.stringPatterns ?? []).map((entry) => ({
      ...entry,
      matcher: new RegExp(entry.pattern ?? ''),
    }))
    const categoryName = new RegExp(options.categoryNamePattern ?? '.', 'i')
    const deniedNames = new Set((options.deniedNames ?? []).map(normaliseName))
    const ignoredNumbers = new Set(options.ignoredNumbers ?? [-1, 0, 1])
    const reportedExpressions = new WeakSet()

    const validName = (name: string | null) =>
      name !== null &&
      (
        categoryName.test(name) ||
        /^[A-Z][A-Z0-9_]+$/.test(name) ||
        /[a-z][A-Z]/.test(name)
      ) &&
      !deniedNames.has(normaliseName(name))

    const checkSemanticString = (node: AstNode, value: string) => {
      const matched = patterns.find((entry) =>
        entry.matcher.test(value)
      )
      if (!matched) return
      const declaration =
        node.parent?.type === 'VariableDeclarator' && node.parent.init === node
          ? node.parent
          : null
      const name = getBindingName(declaration?.id)
      const isConst =
        declaration !== null &&
        (declaration.parent as AstNode | undefined)?.kind === 'const'
      if (isConst && validName(name)) return
      if (declaration !== null && isConst && name !== null) {
        context.report({ node: declaration.id, messageId: 'name', data: { name } })
        return
      }
      context.report({
        node,
        messageId: 'date',
        data: { category: matched.category ?? '' },
      })
    }

    return {
      Literal(node: AstNode) {
        if (typeof node.value === 'string') {
          checkSemanticString(node, node.value)
          return
        }

        if (options.numbers === false || typeof node.value !== 'number') return
        if (ignoredNumbers.has(node.value)) return
        const root = numericExpressionRoot(node)
        if (reportedExpressions.has(root)) return
        const value = numericValue(root)
        if (value !== null && ignoredNumbers.has(value)) return
        if (isStructuralNumber(root, options)) return

        const declaration = owningConst(root)
        const name = getBindingName(declaration?.id)
        if (declaration && validName(name)) return
        if (declaration && name !== null) {
          reportedExpressions.add(root)
          context.report({ node: declaration.id, messageId: 'name', data: { name } })
          return
        }
        reportedExpressions.add(root)
        context.report({ node: root, messageId: 'number' })
      },
      TemplateLiteral(node: AstNode) {
        if (node.expressions.length !== 0 || node.quasis.length !== 1) return
        const quasi = node.quasis[0]
        if (!quasi) return
        const value = quasi.value.cooked
        if (value !== null && value !== undefined) checkSemanticString(node, value)
      },
    }
  },
} as unknown as Rule.RuleModule

const matchingUsage = (filename: string, mappings: UsageMapping[], usage: string) =>
  mappings.find((mapping) =>
    mapping.usages?.includes(usage) && new RegExp(mapping.filePattern ?? '').test(filename)
  )

const requireCanonicalContract = {
  meta: {
    type: 'problem',
    schema: [{ type: 'object', additionalProperties: true }],
    messages: {
      ambiguous: 'The {{usage}} contract is ambiguous here. Add a declarative file-and-syntax mapping before choosing a constant.',
      canonical: 'Use {{exportName}} from "{{module}}"{{boundary}}.',
    },
  },
  create(context: PluginRuleContext) {
    const options = context.options[0] ?? {}
    const contracts = new Map((options.contracts ?? []).map((contract) =>
      [contract.id, contract]
    ))
    const mappings: UsageMapping[] = options.usageMappings ?? []
    const imports = new Map<string, { module: string; imported: string }>()
    const filename = context.filename.replaceAll('\\', '/')

    const canonicalReference = (node: AstNode | null | undefined, contract: ContractDefinition | undefined) =>
      node?.type === 'Identifier' &&
      imports.get(node.name)?.module === contract?.module &&
      imports.get(node.name)?.imported === contract?.export

    const reportUsage = (
      node: AstNode,
      usage: string,
      expression: AstNode | null | undefined,
      boundary: string = ''
    ) => {
      const mapping = matchingUsage(filename, mappings, usage)
      if (!mapping) {
        context.report({
          node,
          messageId: 'ambiguous',
          data: { usage },
        })
        return
      }
      const contract = contracts.get(mapping.contract ?? '')
      const valid =
        boundary === ' converted to a string at the DOM boundary'
          ? expression?.type === 'CallExpression' &&
            expression.callee.type === 'Identifier' &&
            expression.callee.name === 'String' &&
            expression.arguments.length === 1 &&
            canonicalReference(expression.arguments[0], contract)
          : canonicalReference(expression, contract)
      if (!valid) {
        context.report({
          node,
          messageId: 'canonical',
          data: { exportName: contract?.export ?? '', module: contract?.module ?? '', boundary },
        })
      }
    }

    return {
      ImportDeclaration(node: AstNode) {
        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue
          imports.set(specifier.local.name, {
            module: node.source.value,
            imported: specifier.imported.type === 'Identifier'
              ? specifier.imported.name
              : String(specifier.imported.value),
          })
        }
      },
      Property(node: AstNode) {
        if (getObjectPropertyName(node) !== 'maxLength') return
        reportUsage(node, 'maxLength property', node.value)
      },
      JSXAttribute(node: AstNode) {
        if (node.name.name !== 'maxLength') return
        const expression = node.value?.type === 'JSXExpressionContainer' ? node.value.expression : node.value
        reportUsage(node, 'maxLength property', expression)
      },
      CallExpression(node: AstNode) {
        if (callName(node) !== 'toHaveAttribute') return
        if (node.arguments[0]?.type !== 'Literal' || node.arguments[0].value !== 'maxlength') return
        reportUsage(
          node,
          'maxlength DOM assertion',
          node.arguments[1],
          ' converted to a string at the DOM boundary'
        )
      },
      VariableDeclarator(node: AstNode) {
        const name = getBindingName(node.id)
        if (name === null) return
        const mapping = mappings.find((candidate) =>
          candidate.identifierPattern &&
          new RegExp(candidate.identifierPattern).test(name) &&
          (!candidate.exceptFilePattern || !new RegExp(candidate.exceptFilePattern).test(filename))
        )
        if (!mapping) return
        const contract = contracts.get(mapping.contract ?? '')
        if (canonicalReference(node.init, contract)) return
        context.report({
          node,
          messageId: 'canonical',
          data: { exportName: contract?.export ?? '', module: contract?.module ?? '', boundary: '' },
        })
      },
    }
  },
} as unknown as Rule.RuleModule

const plugin = {
  rules: {
    'require-named-literal': requireNamedLiteral,
    'require-canonical-contract': requireCanonicalContract,
  },
} as unknown as ESLint.Plugin

export default plugin
