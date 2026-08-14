import { fileURLToPath } from 'node:url'

/**
 * Durable per-lane journals under `backend/data/<lane>/`. Ephemeral lanes
 * (e2e, e2e-ui, lighthouse) use mkdtemp instead — never this tree.
 *
 * One process per file: sharing a journal across backends is unsupported.
 */
export const DEV_DATOM_LOG_PATH = fileURLToPath(
  new URL('../data/dev/datoms.jsonl', import.meta.url)
)

export const PREVIEW_DATOM_LOG_PATH = fileURLToPath(
  new URL('../data/preview/datoms.jsonl', import.meta.url)
)

/** Default when `DATOM_LOG_PATH` is unset — the local `npm start` lane. */
export const DEFAULT_DATOM_LOG_PATH = DEV_DATOM_LOG_PATH
