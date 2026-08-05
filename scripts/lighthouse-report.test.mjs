import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  createLighthouseSummary,
  evaluateLighthouseQuality,
} from './lighthouse-report.mjs'

/** @param {{performance: number, accessibility: number, bestPractices: number, seo: number, unusedJavaScript: number, scriptBytes?: number}} values */
const report = ({
  performance,
  accessibility,
  bestPractices,
  seo,
  unusedJavaScript,
  scriptBytes = 130_000,
}) => ({
  categories: {
    performance: { score: performance },
    accessibility: { score: accessibility },
    'best-practices': { score: bestPractices },
    seo: { score: seo },
  },
  audits: {
    'unused-javascript': {
      title: 'Reduce unused JavaScript',
      score: 0,
      scoreDisplayMode: 'metricSavings',
      numericValue: unusedJavaScript,
      displayValue: `Est savings of ${unusedJavaScript} KiB`,
      details: { overallSavingsBytes: unusedJavaScript * 1024 },
    },
    'resource-summary': {
      details: {
        items: [{ resourceType: 'script', transferSize: scriptBytes }],
      },
    },
  },
})

test('reports the lowest category scores and worst diagnostics across runs', () => {
  const summary = createLighthouseSummary([
    report({
      performance: 1,
      accessibility: 1,
      bestPractices: 1,
      seo: 1,
      unusedJavaScript: 40,
    }),
    report({
      performance: 0.99,
      accessibility: 1,
      bestPractices: 1,
      seo: 1,
      unusedJavaScript: 45,
    }),
  ])

  assert.match(summary, /Runs \| 2/)
  assert.match(summary, /Performance \| 99 \| Below 100/)
  assert.match(summary, /Accessibility \| 100 \| Pass/)
  assert.match(summary, /Best Practices \| 100 \| Pass/)
  assert.match(summary, /SEO \| 100 \| Pass/)
  assert.match(summary, /Reduce unused JavaScript \| Est savings of 45 KiB/)
})

test('fails quality when a perfect category or JavaScript budget regresses', () => {
  const quality = evaluateLighthouseQuality([
    report({
      performance: 0.99,
      accessibility: 1,
      bestPractices: 1,
      seo: 1,
      unusedJavaScript: 49,
      scriptBytes: 145_000,
    }),
  ], {
    maxScriptTransferBytes: 140 * 1024,
    maxUnusedJavaScriptBytes: 48 * 1024,
  })

  assert.equal(quality.passed, false)
  assert.match(quality.failures.join('\n'), /Performance.*99/)
  assert.match(quality.failures.join('\n'), /JavaScript transfer.*145000.*143360/)
  assert.match(quality.failures.join('\n'), /Unused JavaScript.*50176.*49152/)
})
