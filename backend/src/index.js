import { createApp } from './app.js'
import { createServerTodoActor } from './todos/createServerTodoActor.js'

const port = Number(process.env.PORT ?? 3001)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535')
}

if (process.env.APP_ENV === 'e2e' && !process.env.TODO_LOG_PATH) {
  throw new Error('E2E mode requires an explicit TODO_LOG_PATH')
}

const todoActor = await createServerTodoActor({
  filePath: process.env.TODO_LOG_PATH,
})
const app = createApp(todoActor)

app.listen(port, () => console.log(`Example app listening on port ${port}!`))
