import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** @param {string} workspace @param {string} name */
const bin = (workspace, name) =>
  resolve(ROOT, workspace, 'node_modules/.bin', name)

/**
 * The four stages of `verify`, in the order a failure invalidates what follows.
 *
 * Each stage is named for what has to exist before it can run, which is also why
 * the costs rise the way they do:
 *
 *   static   nothing executes
 *   unit     code executes in Node
 *   browser  code executes in real Chromium
 *   quality  a production bundle is measured
 *
 * `verify` fails fast BETWEEN stages and collects every failure WITHIN a stage.
 *
 * @typedef {{
 *   command: string,
 *   args: string[],
 *   cwd?: string,
 *   env?: Record<string, string>,
 *   tolerateOffline?: boolean,
 * }} Invocation
 *
 * `artifact` is a repo-relative file a step writes that is worth reading even
 * when the step passed. `verify` links it once the step has run.
 *
 * @typedef {{
 *   name: string,
 *   blurb: string,
 *   invocations: Invocation[],
 *   artifact?: string,
 * }} Step
 * @typedef {{ name: string, blurb: string, steps: Step[] }} Stage
 */

/** @type {Stage[]} */
export const STAGES = [
  {
    name: 'static',
    blurb: 'nothing executes',
    steps: [
      {
        name: 'typecheck',
        blurb: 'generated declarations plus every tsconfig project',
        invocations: [{ command: 'npm', args: ['run', 'typecheck'] }],
      },
      {
        name: 'lint',
        blurb: 'eslint over every directory typecheck covers, autofixing first',
        invocations: [
          {
            command: bin('.', 'eslint'),
            args: [
              '--fix',
              'shared/src',
              'scripts',
              'e2e',
              'vitest.config.mjs',
              'playwright.config.js',
              'eslint.config.mjs',
            ],
          },
          { command: bin('backend', 'eslint'), args: ['--fix', 'src'], cwd: resolve(ROOT, 'backend') },
          { command: bin('frontend', 'eslint'), args: ['--fix', 'src'], cwd: resolve(ROOT, 'frontend') },
        ],
      },
      {
        name: 'diagrams',
        blurb: 'every Mermaid edge in the docs survives rendering',
        invocations: [
          { command: 'node', args: ['scripts/check-diagrams.mjs'] },
        ],
      },
      {
        name: 'audit',
        blurb: 'high and critical advisories in every install root',
        invocations: ['.', 'shared', 'backend', 'frontend'].map((workspace) => ({
          command: 'npm',
          args: ['audit', '--audit-level=high'],
          cwd: resolve(ROOT, workspace),
          // An unreachable registry means "unknown", which must never be
          // reported as "vulnerable". The lockfiles have not moved, so the last
          // answer still holds and CI re-checks it with a network.
          tolerateOffline: true,
        })),
      },
    ],
  },
  {
    name: 'unit',
    blurb: 'code executes in Node',
    steps: [
      {
        name: 'unit',
        blurb: 'shared, backend, frontend logic, and repo scripts',
        invocations: [
          {
            command: bin('.', 'vitest'),
            args: ['run', '--coverage', '--reporter=default', '--reporter=blob'],
          },
          { command: 'node', args: ['scripts/coverage-producer-cli.mjs', 'node'] },
        ],
      },
    ],
  },
  {
    name: 'browser',
    blurb: 'code executes in real Chromium',
    steps: [
      {
        name: 'storybook',
        blurb: 'every story play function and axe pass',
        invocations: [
          { command: 'node', args: ['scripts/run-storybook-coverage.mjs'] },
          { command: 'node', args: ['scripts/coverage-producer-cli.mjs', 'storybook'] },
        ],
      },
      {
        name: 'e2e',
        blurb: 'real server, real journal, multi-tab and reconnect journeys',
        invocations: [
          { command: 'node', args: ['scripts/kill-ports.mjs', 'e2e'] },
          { command: bin('.', 'playwright'), args: ['test'] },
        ],
      },
    ],
  },
  {
    name: 'quality',
    blurb: 'a production bundle is measured',
    steps: [
      {
        name: 'build',
        blurb: 'production frontend bundle with sourcemaps',
        invocations: [
          { command: 'npm', args: ['run', 'build', '--prefix', 'frontend', '--', '--sourcemap'] },
        ],
      },
      {
        name: 'lighthouse',
        blurb: 'three desktop runs, score 100 in every category, JS budgets',
        invocations: [{ command: 'node', args: ['scripts/run-lighthouse.mjs'] }],
        artifact: 'lighthouse-reports/run-1.report.html',
      },
      {
        name: 'coverage',
        blurb: 'producer-owned exact baselines plus informational combined coverage',
        invocations: [
          {
            command: bin('.', 'vitest'),
            args: [
              '--mergeReports=.vitest-reports',
              '--coverage',
              '--coverage.reportsDirectory=coverage',
              '--reporter=dot',
            ],
          },
          { command: 'node', args: ['scripts/coverage-evidence-cli.mjs'] },
        ],
        artifact: 'coverage/report.html',
      },
    ],
  },
]

/** @param {string} name */
export const findStage = (name) => STAGES.find((stage) => stage.name === name)

/** @param {string} name */
export const findStep = (name) =>
  STAGES.flatMap((stage) => stage.steps).find((step) => step.name === name)
