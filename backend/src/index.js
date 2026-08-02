import { createApp } from './app.js'
import { createServerTodoActor } from './todos/createServerTodoActor.js'

const PORT = 3001
const todoActor = await createServerTodoActor({
  filePath: process.env.TODO_LOG_PATH,
})
const app = createApp(todoActor)

app.listen(PORT, () => console.log(`Example app listening on port ${PORT}!`))
