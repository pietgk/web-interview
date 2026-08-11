/**
 * Wraps a `.excalidraw` scene in a self-contained HTML page and opens it.
 *
 * The page is a real Excalidraw canvas, not a picture of one: pan, zoom, edit,
 * and export from the browser. It is one file with no server, so it can be
 * committed next to the scene and linked from docs.
 *
 *   npm run whiteboard                        # docs/architecture.excalidraw
 *   npm run whiteboard docs/some-board.excalidraw
 *   npm run whiteboard docs/some-board.excalidraw --no-open
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { writeWhiteboardPage } from './whiteboard-html.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_SCENE = 'docs/architecture.excalidraw'
/** Long enough for a dispatching handler to exit, short enough not to feel stuck. */
const DISPATCH_GRACE_MS = 3000

const args = process.argv.slice(2)
const shouldOpen = !args.includes('--no-open')
const scenePath = resolve(ROOT, args.find((arg) => !arg.startsWith('--')) ?? DEFAULT_SCENE)

if (!existsSync(scenePath)) {
  console.error(`No such scene: ${scenePath}`)
  process.exit(1)
}

const htmlPath = writeWhiteboardPage(scenePath)
console.log('Whiteboard:  ' + pathToFileURL(htmlPath).href)
console.log('Scene:       ' + scenePath)
console.log('(Edit in the page, then File → Save to... over the scene to keep changes.)')

/**
 * Hands the page to the OS and reports whether that worked.
 *
 * The handler is only asked to dispatch, so it normally exits within
 * milliseconds and waiting for it is what makes a failure visible. Some Linux
 * `xdg-open` handlers instead block for as long as the browser lives, so an
 * unfinished child is treated as success and released rather than hanging the
 * script.
 *
 * @returns {Promise<void>}
 */
const openInBrowser = () =>
  new Promise((done) => {
    const platform = process.platform
    const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open'
    const commandArgs = platform === 'win32' ? ['/c', 'start', '', htmlPath] : [htmlPath]
    // Inherited, so whatever the handler says about a failure reaches the user
    // instead of being swallowed.
    const child = spawn(command, commandArgs, { stdio: 'inherit', detached: true })

    const release = setTimeout(() => {
      child.unref()
      done()
    }, DISPATCH_GRACE_MS)

    child.on('error', (error) => {
      clearTimeout(release)
      console.error(`Could not run \`${command}\`: ${error.message}`)
      console.error('Open the whiteboard URL above yourself.')
      done()
    })
    child.on('exit', (code) => {
      clearTimeout(release)
      if (code !== 0) {
        console.error(`\`${command}\` exited ${code} without opening the page.`)
        console.error('Open the whiteboard URL above yourself.')
      }
      done()
    })
  })

if (shouldOpen) await openInBrowser()
