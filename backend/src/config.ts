import { seedTodoListsSchema } from './seed.ts'
import type { SeedTodoLists } from './seed.ts'

const DEFAULT_BACKEND_PORT = 3001
const DEFAULT_DEVELOPMENT_ORIGIN = 'http://localhost:3000'

const parsePort = (value: string | undefined) => {
  const port = Number(value ?? DEFAULT_BACKEND_PORT)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535')
  }
  return port
}

const parseInitialTodoLists = (value: string | undefined): SeedTodoLists | undefined => {
  if (!value) return undefined

  let decoded
  try {
    decoded = JSON.parse(value)
  } catch (error) {
    throw new Error('TODO_SEED_JSON must contain valid JSON', { cause: error })
  }

  const parsed = seedTodoListsSchema.safeParse(decoded)
  if (!parsed.success) {
    throw new Error('TODO_SEED_JSON must contain valid Todo Lists')
  }
  return parsed.data
}

const parseCorsOrigins = (value: string | undefined, appEnvironment: string) => {
  if (value) {
    return value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  }
  return appEnvironment === 'production' ? [] : [DEFAULT_DEVELOPMENT_ORIGIN]
}

export const readBackendConfig = (environment: NodeJS.ProcessEnv = process.env) => {
  const appEnvironment = environment.APP_ENV ?? 'development'
  const datomLogPath = environment.DATOM_LOG_PATH || undefined
  if (appEnvironment === 'e2e' && !datomLogPath) {
    throw new Error('E2E mode requires an explicit DATOM_LOG_PATH')
  }

  return Object.freeze({
    appEnvironment,
    corsOrigins: parseCorsOrigins(environment.CORS_ORIGINS, appEnvironment),
    datomLogPath,
    initialTodoLists: parseInitialTodoLists(environment.TODO_SEED_JSON),
    port: parsePort(environment.PORT),
  })
}
