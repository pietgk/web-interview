import { createApp } from './app.js'
import { readBackendConfig } from './config.js'
import { createServerTodoActor } from './todos/createServerTodoActor.js'

const config = readBackendConfig()
const todoActor = await createServerTodoActor({
  filePath: config.todoLogPath,
  initialTodoLists: config.initialTodoLists,
})
const app = createApp(todoActor, { corsOrigins: config.corsOrigins })

app.listen(config.port, () =>
  console.log(`Example app listening on port ${config.port}!`)
)
