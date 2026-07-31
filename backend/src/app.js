import express from 'express'
import cors from 'cors'
import { createStore } from './store.js'
import { createTodoListsRouter } from './routes/todoLists.js'

export const createApp = (store = createStore()) => {
  const app = express()

  app.use(cors())
  app.use(express.json())

  app.get('/', (_req, res) => res.send('Hello World!'))
  app.use('/api/todo-lists', createTodoListsRouter(store))

  return app
}
