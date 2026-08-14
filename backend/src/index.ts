import { createApp } from './app.ts'
import { readBackendConfig } from './config.ts'
import { createDatomService } from './todos/datomService.ts'

const config = readBackendConfig()
const datomService = await createDatomService({
  filePath: config.datomLogPath,
  seed: config.initialTodoLists,
})
const app = createApp(datomService, { corsOrigins: config.corsOrigins })

app.listen(config.port, () =>
  console.log(`Todo app listening on port ${config.port}!`)
)
