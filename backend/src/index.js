import { createApp } from './app.js'

const PORT = 3001
const app = createApp()

app.listen(PORT, () => console.log(`Example app listening on port ${PORT}!`))
