/**
 * Renders a `.excalidraw` scene into one self-contained HTML file.
 *
 * The scene JSON is inlined rather than fetched, so the result opens by
 * double-click over `file://` with no server and no CORS. Excalidraw itself
 * comes from a CDN, which is the only network dependency; when that fails the
 * page still shows the static fallback instead of an empty canvas.
 *
 * Kept separate from `whiteboard.mjs` so importing the renderer cannot trigger
 * that script's CLI side effects.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'

/** Pinned so a CDN release cannot silently change what a committed doc renders. */
export const EXCALIDRAW_VERSION = '0.18.1'
/** React 19 is inside Excalidraw's peer range (`^17 || ^18.2 || ^19`). */
export const REACT_VERSION = '19.2.0'

const CDN = 'https://esm.sh'
const EXCALIDRAW_DIST = `${CDN}/@excalidraw/excalidraw@${EXCALIDRAW_VERSION}/dist/prod`
/** Excalidraw resolves its fonts against this at runtime, so it must be a directory URL. */
const ASSET_PATH = `${EXCALIDRAW_DIST}/`

/**
 * `</script` inside the inlined JSON would end the host `<script>` element.
 * `<\/` is a valid escape inside a JSON string, so the payload survives intact.
 *
 * @param {unknown} scene
 * @returns {string}
 */
const inlineJson = (scene) => JSON.stringify(scene).replace(/<\//g, '<\\/')

/** @param {string} text @returns {string} */
const escapeHtml = (text) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/**
 * @param {{
 *   title: string,
 *   scene: unknown,
 *   sourceName: string,
 *   fallbackSvg?: string,
 * }} options
 * @returns {string}
 */
export const renderWhiteboardHtml = ({ title, scene, sourceName, fallbackSvg }) => {
  const fallback =
    fallbackSvg ??
    `<p class="fallback-note">This board needs ${escapeHtml(CDN)} to render. Open <code>${escapeHtml(sourceName)}</code> in Excalidraw instead.</p>`

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${EXCALIDRAW_DIST}/index.css" />
  <style>
    :root { color-scheme: light; }
    html, body { height: 100%; }
    body {
      margin: 0;
      display: flex;
      flex-direction: column;
      font-family: ui-sans-serif, system-ui, sans-serif;
      background: #f1f3f5;
      color: #212529;
    }
    header {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.75rem 1.25rem;
      padding: 0.75rem 1.25rem;
      background: #fff;
      border-bottom: 1px solid #dee2e6;
    }
    header h1 { margin: 0; font-size: 1rem; font-weight: 600; }
    header a { color: #1864ab; font-size: 0.875rem; }
    header code { font-size: 0.8125rem; color: #495057; }
    header button {
      font: inherit;
      font-size: 0.8125rem;
      padding: 0.25rem 0.75rem;
      border: 1px solid #ced4da;
      border-radius: 6px;
      background: #fff;
      color: #212529;
      cursor: pointer;
    }
    header button:hover { background: #f1f3f5; }
    header button[aria-pressed='true'] { background: #e7f5ff; border-color: #74c0fc; color: #1864ab; }
    main { flex: 1; min-height: 0; display: flex; }
    #board { flex: 1; min-width: 0; }
    /* Excalidraw sizes itself to its container, which therefore needs real dimensions. */
    #board .excalidraw-wrapper { height: 100%; width: 100%; }
    #fallback {
      flex: 1;
      min-width: 0;
      overflow: auto;
      padding: 1.25rem;
    }
    #fallback svg { display: block; margin: 0 auto; max-width: 100%; height: auto; }
    .fallback-note { margin: 0 auto; max-width: 40rem; text-align: center; color: #495057; }
  </style>
  <script>
    window.EXCALIDRAW_ASSET_PATH = ${JSON.stringify(ASSET_PATH)}
  </script>
  <script type="importmap">
  {
    "imports": {
      "react": "${CDN}/react@${REACT_VERSION}",
      "react/jsx-runtime": "${CDN}/react@${REACT_VERSION}/jsx-runtime",
      "react-dom": "${CDN}/react-dom@${REACT_VERSION}",
      "react-dom/client": "${CDN}/react-dom@${REACT_VERSION}/client"
    }
  }
  </script>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <code>${escapeHtml(sourceName)}</code>
    <button type="button" id="edit-toggle" hidden aria-pressed="false">Edit</button>
    <a href="./${escapeHtml(sourceName)}">download scene</a>
    <a href="https://excalidraw.com" target="_blank" rel="noreferrer">excalidraw.com</a>
  </header>
  <main>
    <div id="fallback">
${fallback}
    </div>
  </main>
  <script type="application/json" id="scene">${inlineJson(scene)}</script>
  <script type="module">
    const fallback = document.getElementById('fallback')
    const scene = JSON.parse(document.getElementById('scene').textContent)

    try {
      const [React, { createRoot }, { Excalidraw }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('${CDN}/@excalidraw/excalidraw@${EXCALIDRAW_VERSION}?external=react,react-dom'),
      ])

      const board = document.createElement('div')
      board.id = 'board'
      fallback.replaceWith(board)

      const root = createRoot(board)
      // A doc board is read first and edited rarely, so it opens in view mode:
      // no tool palette over the drawing, no accidental edits. Re-rendering the
      // same element type keeps Excalidraw's own state (scroll, zoom, edits)
      // across the toggle, so no React state of our own is needed.
      let viewMode = true
      const render = () =>
        root.render(
          React.createElement(Excalidraw, {
            initialData: {
              elements: scene.elements,
              // \`collaborators\` must be a Map at runtime; a scene saved from
              // the web app can carry it as a plain object, which throws.
              appState: { ...scene.appState, collaborators: undefined },
              files: scene.files,
            },
            viewModeEnabled: viewMode,
            // \`initialData.scrollToContent\` only centres the drawing at 100%. A
            // doc board should open with the whole picture visible, which needs
            // the imperative API - one frame later, because the callback fires
            // before the canvas has been laid out and fitting to a zero-size
            // viewport is a no-op.
            excalidrawAPI: (api) =>
              requestAnimationFrame(() =>
                api.scrollToContent(scene.elements, { fitToContent: true }),
              ),
            UIOptions: { canvasActions: { toggleTheme: true } },
          }),
        )
      render()

      const toggle = document.getElementById('edit-toggle')
      toggle.hidden = false
      toggle.addEventListener('click', () => {
        viewMode = !viewMode
        toggle.textContent = viewMode ? 'Edit' : 'Done'
        toggle.setAttribute('aria-pressed', String(!viewMode))
        render()
      })
    } catch (error) {
      console.error(error)
      const note = document.createElement('p')
      note.className = 'fallback-note'
      note.textContent =
        'Interactive board unavailable (${escapeHtml(CDN)} did not load). Showing the static copy.'
      fallback.prepend(note)
    }
  </script>
</body>
</html>
`
}

/**
 * Renders `<scene>.html` beside a `.excalidraw` file, reusing a sibling `.svg`
 * as the offline fallback when one exists so both writers agree on the output.
 *
 * @param {string} sceneFile absolute path to a `.excalidraw` file
 * @returns {string} absolute path of the HTML written
 */
export const writeWhiteboardPage = (sceneFile) => {
  const sourceName = basename(sceneFile)
  const stem = sourceName.replace(/\.excalidraw$/, '')
  const svgFile = resolve(dirname(sceneFile), `${stem}.svg`)
  const htmlFile = resolve(dirname(sceneFile), `${stem}.html`)
  const scene = JSON.parse(readFileSync(sceneFile, 'utf8'))

  writeFileSync(
    htmlFile,
    renderWhiteboardHtml({
      // Excalidraw stores the document name in the scene, so the page title
      // tracks the drawing rather than a second copy in the build script.
      title: scene.appState?.name ?? stem.replace(/[-_]/g, ' '),
      scene,
      sourceName,
      fallbackSvg: existsSync(svgFile) ? readFileSync(svgFile, 'utf8') : undefined,
    }),
  )
  return htmlFile
}
