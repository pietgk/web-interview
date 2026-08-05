import { createApp } from './app.js'
import { readBackendConfig } from './config.js'
import { createDatomService } from './todos/datomService.js'

const config = readBackendConfig()
const datomService = await createDatomService({
  filePath: config.datomLogPath,
  seed: config.initialTodoLists,
})
const app = createApp(datomService, { corsOrigins: config.corsOrigins })

app.listen(config.port, () =>
  console.log(`Todo app listening on port ${config.port}!`)
)
