/**
 * Open Excalidraw and point at the architecture scene file.
 * Edit there (File → Open), save wherever you want.
 *
 *   npm run whiteboard
 *   node whiteboard
 *   node whiteboard.js
 *   node scripts/whiteboard.mjs
 */
import { spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCENE = resolve(ROOT, 'docs/architecture.excalidraw')
const EXCALIDRAW = 'https://excalidraw.com'

console.log('Excalidraw:  ' + EXCALIDRAW)
console.log('Open file:   ' + SCENE)
console.log('(In Excalidraw: File → Open → pick the path above, then Save As when you want.)')

const platform = process.platform
const command =
  platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open'
const args = platform === 'win32' ? ['/c', 'start', '', EXCALIDRAW] : [EXCALIDRAW]
spawn(command, args, { stdio: 'ignore', detached: true }).unref()
