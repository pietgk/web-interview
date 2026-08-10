#!/usr/bin/env node
/**
 * Free LISTEN sockets on named repo port lanes (or explicit ports).
 * Listeners only — same rule as the former `scripts/demo.mjs` freePorts, so
 * proxy clients on a port are not collateral damage.
 *
 * Import `{ freeLanes, LANES, … }` for own-lane preflight from starters.
 * No args + TTY → interactive status / kill prompt (live values from LANES).
 */
import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  E2E_GATE_API_PORT,
  E2E_GATE_WEB_PORT,
  E2E_UI_API_PORT,
  E2E_UI_WEB_PORT,
} from '../e2e/environment.mjs'
import {
  DEV_DATOM_LOG_PATH,
  PREVIEW_DATOM_LOG_PATH,
} from '../backend/src/dataPaths.js'
import { resolveCommand } from './commandResolution.mjs'

export const DEV_WEB_PORT = 3000
export const DEV_API_PORT = 3001

export const PREVIEW_WEB_PORT = 3010
export const PREVIEW_API_PORT = 3011

export const LIGHTHOUSE_WEB_PORT = 3200
export const LIGHTHOUSE_API_PORT = 3201

export const STORYBOOK_PORT = 6006

/** Durable journals keyed by overview lane (ephemeral lanes use mkdtemp). */
const DURABLE_JOURNALS = Object.freeze({
  dev: DEV_DATOM_LOG_PATH,
  preview: PREVIEW_DATOM_LOG_PATH,
})

/** @type {Record<string, readonly number[]>} */
export const LANES = {
  dev: [DEV_WEB_PORT, DEV_API_PORT],
  'dev-web': [DEV_WEB_PORT],
  'dev-api': [DEV_API_PORT],
  preview: [PREVIEW_WEB_PORT, PREVIEW_API_PORT],
  e2e: [E2E_GATE_WEB_PORT, E2E_GATE_API_PORT],
  'e2e-ui': [E2E_UI_WEB_PORT, E2E_UI_API_PORT],
  lighthouse: [LIGHTHOUSE_WEB_PORT, LIGHTHOUSE_API_PORT],
  storybook: [STORYBOOK_PORT],
}

/** Lanes shown in `npm run kill` (excludes `dev-web` / `dev-api` slices). */
export const OVERVIEW_LANES = Object.freeze([
  'dev',
  'preview',
  'e2e',
  'e2e-ui',
  'lighthouse',
  'storybook',
])

const ALL_LANE_PORTS = [...new Set(Object.values(LANES).flat())]

const PORT_RELEASE_POLL_MS = 50
const PORT_RELEASE_ATTEMPTS = 40
const LANE_COLUMN_WIDTH = 12
const PORTS_COLUMN_WIDTH = 14

/**
 * @param {string} token
 * @returns {number[]}
 */
export const resolvePorts = (token) => {
  if (token === 'all') return ALL_LANE_PORTS
  if (Object.hasOwn(LANES, token)) return [...LANES[token]]
  const port = Number(token)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Unknown kill target ${JSON.stringify(token)}; use a lane (${Object.keys(LANES).join(', ')}, all) or a port`
    )
  }
  return [port]
}

/**
 * @param {number[]} ports
 * @returns {number[]}
 */
const listenerPids = (ports) => {
  if (ports.length === 0) return []
  const [first, ...rest] = ports
  const args = [
    '-ti',
    `tcp:${first}`,
    ...rest.flatMap((port) => ['-i', `tcp:${port}`]),
    '-sTCP:LISTEN',
  ]
  const found = spawnSync('lsof', args, { encoding: 'utf8' })
  return (found.stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((pid) => Number(pid))
    .filter((pid) => Number.isInteger(pid) && pid > 0)
}

/**
 * SIGTERM every LISTEN process on the given ports. No-op when nothing listens.
 * After a kill, waits until the ports are free so a following bind does not race.
 *
 * @param {number[]} ports
 * @returns {{ ports: number[], pids: number[] }}
 */
export const freePorts = (ports) => {
  const uniquePorts = [...new Set(ports)]
  const pids = [...new Set(listenerPids(uniquePorts))]
  if (pids.length === 0) {
    return { ports: uniquePorts, pids }
  }
  console.log(`Freeing ports ${uniquePorts.join(', ')}: killing ${pids.join(', ')}`)
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // Already gone between the lookup and the signal.
    }
  }
  for (let attempt = 0; attempt < PORT_RELEASE_ATTEMPTS; attempt += 1) {
    if (listenerPids(uniquePorts).length === 0) break
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, PORT_RELEASE_POLL_MS)
  }
  return { ports: uniquePorts, pids }
}

/**
 * @param {...string} tokens lane names, `all`, or numeric ports
 * @returns {{ ports: number[], pids: number[] }}
 */
export const freeLanes = (...tokens) => {
  const ports = [...new Set(tokens.flatMap(resolvePorts))]
  return freePorts(ports)
}

/**
 * @typedef {{ name: string, ports: number[], pids: number[], listening: boolean }} LaneStatus
 */

/** @returns {LaneStatus[]} */
export const overviewLaneStatuses = () =>
  OVERVIEW_LANES.map((name) => {
    const ports = [...LANES[name]]
    const pids = [...new Set(listenerPids(ports))]
    return { name, ports, pids, listening: pids.length > 0 }
  })

/** Print one live row per overview lane (ports from {@link LANES}, not docs). */
export const printLaneStatus = () => {
  console.log('')
  for (const { name, ports, pids, listening } of overviewLaneStatuses()) {
    const portList = ports.join(', ').padEnd(PORTS_COLUMN_WIDTH)
    const status = listening ? `listening  pid ${pids.join(', ')}` : 'free'
    const journal = Object.hasOwn(DURABLE_JOURNALS, name)
      ? `  journal …/data/${name}/datoms.jsonl`
      : name === 'e2e' || name === 'e2e-ui' || name === 'lighthouse'
        ? '  journal temp'
        : ''
    console.log(`  ${name.padEnd(LANE_COLUMN_WIDTH)}${portList}${status}${journal}`)
  }
  console.log('')
}

/** @typedef {{name: string, aliases?: string[], help: string, run: () => void}} KillCommand */

const runInteractive = () => {
  /** @type {KillCommand[]} */
  const commands = [
    {
      name: 'status',
      aliases: ['s', 'refresh'],
      help: 'show lane ports and LISTEN status',
      run: () => printLaneStatus(),
    },
    {
      name: 'all',
      help: 'free every lane',
      run: () => {
        const { pids } = freeLanes('all')
        if (pids.length === 0) console.log('Nothing listening on any lane.')
        printLaneStatus()
      },
    },
    ...OVERVIEW_LANES.map((name) => ({
      name,
      help: `free the ${name} lane`,
      run: () => {
        const { pids } = freeLanes(name)
        if (pids.length === 0) console.log(`Nothing listening on ${name}.`)
        printLaneStatus()
      },
    })),
    {
      name: 'quit',
      aliases: ['exit', 'q'],
      help: 'leave',
      run: () => {
        prompt.close()
        process.exit(0)
      },
    },
    {
      name: 'help',
      aliases: ['?'],
      help: 'show this list',
      run: () => printCommands(),
    },
  ]

  function printCommands() {
    console.log('\nPort lanes. Any unambiguous prefix works; empty Enter refreshes status:')
    for (const { name, help } of commands) console.log(`  ${name.padEnd(LANE_COLUMN_WIDTH)}${help}`)
    console.log('')
  }

  /** @param {string} line */
  const runCommand = (line) => {
    const typed = line.trim().toLowerCase()
    if (!typed) {
      printLaneStatus()
      return
    }
    const resolved = resolveCommand(commands, typed)
    if (!resolved) return

    if ('command' in resolved) {
      resolved.command.run()
      return
    }
    if ('ambiguous' in resolved) {
      console.log(
        `"${typed}" matches ${resolved.ambiguous.map((command) => command.name).join(' and ')}. Type more of it.`
      )
      return
    }
    console.log(`Unknown command "${typed}".`)
    printCommands()
  }

  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'kill >> ',
  })

  printLaneStatus()
  printCommands()
  prompt.prompt()
  prompt.on('line', (line) => {
    runCommand(line)
    prompt.prompt()
  })
  prompt.once('close', () => process.exit(0))
}

const isCli =
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (isCli) {
  const tokens = process.argv.slice(2)
  if (tokens.length === 0) {
    if (process.stdin.isTTY) {
      runInteractive()
    } else {
      printLaneStatus()
    }
  } else {
    const { pids } = freeLanes(...tokens)
    if (pids.length === 0) {
      // Quiet success — starters call this on every boot.
    }
  }
}
