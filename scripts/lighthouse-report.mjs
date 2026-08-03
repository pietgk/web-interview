const CATEGORY_LABELS = Object.freeze({
  performance: 'Performance',
  accessibility: 'Accessibility',
  'best-practices': 'Best Practices',
  seo: 'SEO',
})

/**
 * @param {Array<Record<string, any>>} reports
 * @param {{maxScriptTransferBytes: number, maxUnusedJavaScriptBytes: number}} budgets
 */
export const evaluateLighthouseQuality = (reports, budgets) => {
  /** @type {string[]} */
  const failures = []
  for (const [id, label] of Object.entries(CATEGORY_LABELS)) {
    const scores = reports.map((report) => report.categories?.[id]?.score)
    const lowestScore = scores.every((score) => typeof score === 'number')
      ? Math.round(Math.min(...scores) * 100)
      : null
    if (lowestScore !== 100) {
      failures.push(`${label} score was ${lowestScore ?? 'missing'}; expected 100`)
    }
  }

  const scriptTransferBytes = reports.map((report) =>
    report.audits?.['resource-summary']?.details?.items?.find(
      (/** @type {{resourceType?: string}} */ item) => item.resourceType === 'script'
    )?.transferSize
  )
  const largestScriptTransfer = scriptTransferBytes.every((value) => typeof value === 'number')
    ? Math.max(...scriptTransferBytes)
    : null
  if (
    largestScriptTransfer === null ||
    largestScriptTransfer > budgets.maxScriptTransferBytes
  ) {
    failures.push(
      `JavaScript transfer was ${largestScriptTransfer ?? 'missing'} bytes; budget is ${budgets.maxScriptTransferBytes} bytes`
    )
  }

  const unusedJavaScriptBytes = reports.map((report) =>
    report.audits?.['unused-javascript']?.details?.overallSavingsBytes
  )
  const largestUnusedJavaScript = unusedJavaScriptBytes.every(
    (value) => typeof value === 'number'
  )
    ? Math.max(...unusedJavaScriptBytes)
    : null
  if (
    largestUnusedJavaScript === null ||
    largestUnusedJavaScript > budgets.maxUnusedJavaScriptBytes
  ) {
    failures.push(
      `Unused JavaScript was ${largestUnusedJavaScript ?? 'missing'} bytes; budget is ${budgets.maxUnusedJavaScriptBytes} bytes`
    )
  }

  return {
    passed: failures.length === 0,
    failures,
    largestScriptTransfer,
    largestUnusedJavaScript,
  }
}

/** @param {Array<Record<string, any>>} reports */
export const createLighthouseSummary = (reports) => {
  if (reports.length === 0) throw new Error('No Lighthouse reports found')

  const categoryRows = Object.entries(CATEGORY_LABELS).map(([id, label]) => {
    const scores = reports.map((report) => report.categories?.[id]?.score)
    if (scores.some((score) => typeof score !== 'number')) {
      throw new Error(`Lighthouse report is missing the ${id} category`)
    }
    const score = Math.round(Math.min(...scores) * 100)
    return `| ${label} | ${score} | ${score === 100 ? 'Pass' : 'Below 100'} |`
  })

  /** @type {Map<string, {title: string, displayValue: string, numericValue: number}>} */
  const diagnostics = new Map()
  for (const report of reports) {
    for (const [id, audit] of Object.entries(report.audits ?? {})) {
      if (
        audit?.scoreDisplayMode !== 'metricSavings' ||
        typeof audit.displayValue !== 'string' ||
        audit.score === 1
      ) continue
      const numericValue = typeof audit.numericValue === 'number' ? audit.numericValue : 0
      const current = diagnostics.get(id)
      if (!current || numericValue > current.numericValue) {
        diagnostics.set(id, {
          title: audit.title ?? id,
          displayValue: audit.displayValue.replaceAll('\u00a0', ' '),
          numericValue,
        })
      }
    }
  }

  const diagnosticRows = [...diagnostics.values()]
    .sort((left, right) => right.numericValue - left.numericValue)
    .map(({ title, displayValue }) => `| ${title} | ${displayValue} |`)

  return [
    '## Lighthouse quality',
    '',
    '| Measure | Result |',
    '| --- | ---: |',
    `| Runs | ${reports.length} |`,
    '',
    '| Category | Lowest score | Gate |',
    '| --- | ---: | --- |',
    ...categoryRows,
    '',
    '### Diagnostics',
    '',
    ...(diagnosticRows.length > 0
      ? ['| Diagnostic | Worst observation |', '| --- | --- |', ...diagnosticRows]
      : ['No Lighthouse diagnostics were reported.']),
    '',
  ].join('\n')
}
