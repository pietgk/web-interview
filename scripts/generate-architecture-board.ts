/**
 * Generates docs/architecture.excalidraw (+ .svg and .html companions) from the grilled
 * overview.
 * Run: node scripts/generate-architecture-board.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeWhiteboardPage } from './whiteboard-html.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '../docs')

let seed = 1
const id = (prefix: string) => `${prefix}_${(seed++).toString(36)}`
// Fixed, not `Date.now()`. Every element carries `updated`, so a wall clock made
// the generator non-idempotent: re-running it to change one word rewrote 122
// lines of the scene and buried the real change. Excalidraw only uses this for
// its own bookkeeping, so a constant costs nothing and keeps the diff honest.
const now = Date.UTC(2026, 7, 5)

/**
 * Excalidraw elements are a loose JSON shape whose fields vary by `type`, so
 * both the overrides and the result stay untyped on purpose. The factories
 * below carry the types instead, because they are what call sites use.
 */
const base = (partial: Record<string, any>): Record<string, any> => ({
  angle: 0,
  strokeColor: '#1e1e1e',
  backgroundColor: 'transparent',
  fillStyle: 'solid',
  strokeWidth: 2,
  strokeStyle: 'solid',
  roughness: 0,
  opacity: 100,
  groupIds: [],
  frameId: null,
  roundness: null,
  seed: seed++,
  version: 1,
  versionNonce: seed++,
  isDeleted: false,
  boundElements: null,
  updated: now,
  link: null,
  locked: false,
  ...partial,
})

/**
 * @param {{
 *   x: number,
 *   y: number,
 *   w: number,
 *   h: number,
 *   bg?: string,
 *   stroke?: string,
 *   round?: boolean,
 *   strokeWidth?: number,
 *   id?: string,
 * }} options
 */
const rect = ({ x, y, w, h, bg = 'transparent', stroke = '#1e1e1e', round = true, strokeWidth = 2, id: eid }) =>
  base({
    id: eid || id('r'),
    type: 'rectangle',
    x,
    y,
    width: w,
    height: h,
    backgroundColor: bg,
    strokeColor: stroke,
    strokeWidth,
    roundness: round ? { type: 3 } : null,
  })

// Excalidraw clips a text element to its stored width rather than remeasuring
// on load, so an estimate that is too narrow silently eats the last characters
// ("select a lis"). Comic Shanns advances ~0.58em; this leaves a little slack.
// A text box has no fill, so being generous costs nothing visually.
const CHAR_WIDTH_EM = 0.62

/**
 * @param {{
 *   x: number,
 *   y: number,
 *   t: string,
 *   size?: number,
 *   align?: string,
 *   color?: string,
 *   width?: number,
 *   id?: string,
 * }} options
 */
const text = ({ x, y, t, size = 16, align = 'left', color = '#1e1e1e', width, id: eid }) => {
  const lines = t.split('\n')
  const lineHeight = 1.25
  const w = width ?? Math.max(...lines.map((l) => l.length)) * size * CHAR_WIDTH_EM
  const h = lines.length * size * lineHeight
  return base({
    id: eid || id('t'),
    type: 'text',
    x,
    y,
    width: w,
    height: h,
    text: t,
    originalText: t,
    fontSize: size,
    fontFamily: 3, // monospace-ish clean
    textAlign: align,
    verticalAlign: 'top',
    containerId: null,
    autoResize: width == null,
    lineHeight,
    strokeColor: color,
    backgroundColor: 'transparent',
    strokeWidth: 1,
    roundness: null,
  })
}

/**
 * @param {{
 *   x: number,
 *   y: number,
 *   points: number[][],
 *   label?: string,
 * }} options
 */
const arrow = ({ x, y, points, label }) => {
  const els = [
    base({
      id: id('a'),
      type: 'arrow',
      x,
      y,
      width: points[points.length - 1][0],
      height: points[points.length - 1][1],
      points,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: 'arrow',
      elbowed: false,
      lastCommittedPoint: null,
    }),
  ]
  if (label) {
    els.push(
      text({
        x: x + points[points.length - 1][0] / 2 - 20,
        y: y + points[points.length - 1][1] / 2 - 18,
        t: label,
        size: 14,
        color: '#495057',
      }),
    )
  }
  return els
}

const elements = []

// --- layout constants ---
const PAGE_W = 1180
const MARGIN = 40
const CONTENT_W = PAGE_W - MARGIN * 2

// Title
elements.push(
  text({
    x: MARGIN,
    y: 28,
    t: 'Sellpy todo app — how it’s built',
    size: 32,
    color: '#212529',
  }),
)
elements.push(
  text({
    x: MARGIN,
    y: 68,
    t: 'UI top→bottom  ·  client delivery + journal  ·  datoms  ·  how we verify',
    size: 16,
    color: '#868e96',
  }),
)

// ========== BAND 1: UI ==========
const uiY = 110
const uiH = 320
elements.push(rect({ x: MARGIN, y: uiY, w: CONTENT_W, h: uiH, bg: '#f8f9fa', stroke: '#ced4da' }))
elements.push(text({ x: MARGIN + 16, y: uiY + 12, t: '1 · UI  (top → bottom)', size: 18, color: '#212529' }))

// StatusBar
const sbY = uiY + 48
elements.push(rect({ x: MARGIN + 24, y: sbY, w: CONTENT_W - 48, h: 52, bg: '#e7f5ff', stroke: '#74c0fc' }))
elements.push(
  text({
    x: MARGIN + 40,
    y: sbY + 10,
    t: 'StatusBar — connection / saving / errors',
    size: 16,
  }),
)
elements.push(
  text({
    x: MARGIN + 40,
    y: sbY + 30,
    t: 'Details when needed  ·  action to reconnect / recover',
    size: 13,
    color: '#495057',
  }),
)

// Todo Lists
const listsY = sbY + 64
elements.push(rect({ x: MARGIN + 24, y: listsY, w: CONTENT_W - 48, h: 72, bg: '#fff3bf', stroke: '#fcc419' }))
elements.push(text({ x: MARGIN + 40, y: listsY + 10, t: 'Todo Lists — select a list', size: 16 }))
elements.push(
  text({
    x: MARGIN + 40,
    y: listsY + 32,
    t: '+ creates a draft list (title only until it materializes)',
    size: 13,
    color: '#495057',
  }),
)
elements.push(
  text({
    x: MARGIN + CONTENT_W - 120,
    y: listsY + 22,
    t: '[ + ]',
    size: 20,
    color: '#e67700',
  }),
)

// Focused list
const focusY = listsY + 84
const focusH = 100
elements.push(rect({ x: MARGIN + 24, y: focusY, w: CONTENT_W - 48, h: focusH, bg: '#d3f9d8', stroke: '#51cf66' }))
elements.push(
  text({
    x: MARGIN + 40,
    y: focusY + 8,
    t: 'Focused Todo List',
    size: 16,
  }),
)
elements.push(rect({ x: MARGIN + 40, y: focusY + 32, w: 320, h: 28, bg: '#ffffff', stroke: '#2f9e44' }))
elements.push(text({ x: MARGIN + 48, y: focusY + 36, t: 'Todo List name (rename)', size: 13, color: '#2b8a3e' }))
elements.push(rect({ x: MARGIN + 380, y: focusY + 32, w: 280, h: 28, bg: '#ffffff', stroke: '#2f9e44' }))
elements.push(text({ x: MARGIN + 388, y: focusY + 36, t: 'Add a todo (ghost composer)', size: 13, color: '#2b8a3e' }))
elements.push(
  text({
    x: MARGIN + 40,
    y: focusY + 70,
    t: '↓ todos for the selected list',
    size: 13,
    color: '#495057',
  }),
)

// Focus callout
elements.push(
  rect({
    x: MARGIN + 700,
    y: focusY + 8,
    w: 360,
    h: 80,
    bg: '#ebfbee',
    stroke: '#2f9e44',
    strokeWidth: 1,
  }),
)
elements.push(
  text({
    x: MARGIN + 712,
    y: focusY + 18,
    t: 'FOCUS\ntitle + Add a todo\n(work starts here; rows below are the result)',
    size: 13,
    color: '#2b8a3e',
  }),
)

// ========== BAND 2: MODEL ==========
const modelY = uiY + uiH + 24
const modelH = 220
elements.push(rect({ x: MARGIN, y: modelY, w: CONTENT_W, h: modelH, bg: '#f8f9fa', stroke: '#ced4da' }))
elements.push(
  text({
    x: MARGIN + 16,
    y: modelY + 12,
    t: '2 · Model  — client delivery + server journal',
    size: 18,
  }),
)

const colW = (CONTENT_W - 48 - 80) / 2
const clientX = MARGIN + 24
const serverX = MARGIN + 24 + colW + 80
const boxY = modelY + 48

elements.push(rect({ x: clientX, y: boxY, w: colW, h: 148, bg: '#e7f5ff', stroke: '#339af0' }))
elements.push(text({ x: clientX + 16, y: boxY + 12, t: 'Browser client', size: 16 }))
elements.push(
  text({
    x: clientX + 16,
    y: boxY + 40,
    t: 'connecting → live → reconnecting → failed\noutbox / pendingCount / saving\ncanEdit after server clock\nStatusBar = pure projection',
    size: 14,
    color: '#1864ab',
  }),
)

elements.push(rect({ x: serverX, y: boxY, w: colW, h: 148, bg: '#fff4e6', stroke: '#fd7e14' }))
elements.push(text({ x: serverX + 16, y: boxY + 12, t: 'Server journal', size: 16 }))
elements.push(
  text({
    x: serverX + 16,
    y: boxY + 40,
    t: 'POST → validate → append JSONL\n→ datasync → ack\nbroadcast winners on SSE\n(stream = compacted current set)',
    size: 14,
    color: '#d9480f',
  }),
)

// Arrows between client and server
elements.push(
  ...arrow({
    x: clientX + colW,
    y: boxY + 50,
    points: [
      [0, 0],
      [80, 0],
    ],
    label: 'POST',
  }),
)
elements.push(
  ...arrow({
    x: serverX,
    y: boxY + 100,
    points: [
      [0, 0],
      [-80, 0],
    ],
    label: 'SSE',
  }),
)

// ========== BAND 3: DATA ==========
const dataY = modelY + modelH + 24
const dataH = 200
elements.push(rect({ x: MARGIN, y: dataY, w: CONTENT_W, h: dataH, bg: '#f8f9fa', stroke: '#ced4da' }))
elements.push(text({ x: MARGIN + 16, y: dataY + 12, t: '3 · Data  — datoms', size: 18 }))

const dW = (CONTENT_W - 48 - 24) / 3
const dY = dataY + 48
const blocks = [
  {
    x: MARGIN + 24,
    bg: '#f3d9fa',
    stroke: '#be4bdb',
    title: 'Datom',
    body: '[entity, attribute, value, tx, op]\none fact per write\ntx = identity and order',
  },
  {
    x: MARGIN + 24 + dW + 12,
    bg: '#e5dbff',
    stroke: '#7950f2',
    title: 'Fold',
    body: 'LWW: highest tx wins\nper (entity, attribute)\nshared DatomStore both sides',
  },
  {
    x: MARGIN + 24 + (dW + 12) * 2,
    bg: '#d0bfff',
    stroke: '#5f3dc4',
    title: 'Wire',
    body: 'journal = full history\nSSE = compacted winners\noutbox in-memory',
  },
]
for (const b of blocks) {
  elements.push(rect({ x: b.x, y: dY, w: dW, h: 120, bg: b.bg, stroke: b.stroke }))
  elements.push(text({ x: b.x + 14, y: dY + 12, t: b.title, size: 16 }))
  elements.push(text({ x: b.x + 14, y: dY + 40, t: b.body, size: 13, color: '#495057' }))
}

elements.push(
  text({
    x: MARGIN + 24,
    y: dataY + 176,
    t: 'Example: rename list = one assertion · delete list = retract defining title → children stop projecting',
    size: 13,
    color: '#495057',
  }),
)

// ========== BAND 4: HOW I SHOW IT ==========
const toolY = dataY + dataH + 24
const toolH = 130
elements.push(rect({ x: MARGIN, y: toolY, w: CONTENT_W, h: toolH, bg: '#f8f9fa', stroke: '#ced4da' }))
elements.push(text({ x: MARGIN + 16, y: toolY + 12, t: '4 · How I show it', size: 18 }))

const tiles = [
  { title: 'preview', body: 'Production demo\nbackend under control' },
  { title: 'watch / verify', body: 'Ambient GREEN/RED\nfull CI-ordered gate' },
  { title: 'Storybook', body: 'Docs · play tests\na11y' },
  { title: '100% lighthouse', body: null },
]
const tW = (CONTENT_W - 48 - 36) / 4
tiles.forEach((tile, i) => {
  const x = MARGIN + 24 + i * (tW + 12)
  elements.push(rect({ x, y: toolY + 44, w: tW, h: 56, bg: '#ffffff', stroke: '#868e96' }))
  if (tile.body) {
    elements.push(text({ x: x + 12, y: toolY + 50, t: tile.title, size: 14, color: '#212529' }))
    elements.push(text({ x: x + 12, y: toolY + 70, t: tile.body, size: 12, color: '#495057' }))
  } else {
    elements.push(text({ x: x + 12, y: toolY + 62, t: tile.title, size: 14, color: '#212529' }))
  }
})

elements.push(
  text({
    x: MARGIN + 16,
    y: toolY + toolH + 12,
    t: 'Same commands locally and in CI.',
    size: 14,
    color: '#868e96',
  }),
)

const scene = {
  type: 'excalidraw',
  version: 2,
  source: 'https://excalidraw.com',
  elements,
  appState: {
    // Excalidraw's own document name, and what the HTML wrapper titles the page
    // with. Keeping it in the scene means both agree without a second source.
    name: 'Architecture overview',
    gridSize: null,
    viewBackgroundColor: '#ffffff',
  },
  files: {},
}

mkdirSync(outDir, { recursive: true })
const excalidrawPath = join(outDir, 'architecture.excalidraw')
writeFileSync(excalidrawPath, JSON.stringify(scene, null, 2))
console.log('wrote', excalidrawPath)

// --- SVG companion (GitHub-previewable) ---
const svgEsc = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const svgParts = []
const pageH = toolY + toolH + 50
svgParts.push(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${pageH}" viewBox="0 0 ${PAGE_W} ${pageH}">`,
)
svgParts.push(`<rect width="100%" height="100%" fill="#ffffff"/>`)
svgParts.push(
  `<defs><marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#1e1e1e"/></marker></defs>`,
)

for (const el of elements) {
  if (el.type === 'rectangle') {
    const r = el.roundness ? 8 : 0
    svgParts.push(
      `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="${r}" fill="${el.backgroundColor === 'transparent' ? 'none' : el.backgroundColor}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}"/>`,
    )
  } else if (el.type === 'text') {
    const lines = String(el.text).split('\n')
    const lh = el.fontSize * el.lineHeight
    lines.forEach((line, i) => {
      svgParts.push(
        `<text x="${el.x}" y="${el.y + el.fontSize + i * lh}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="${el.fontSize}" fill="${el.strokeColor}">${svgEsc(line)}</text>`,
      )
    })
  } else if (el.type === 'arrow') {
    const [x2, y2] = el.points[el.points.length - 1]
    const endX = el.x + x2
    const endY = el.y + y2
    svgParts.push(
      `<line x1="${el.x}" y1="${el.y}" x2="${endX}" y2="${endY}" stroke="#1e1e1e" stroke-width="2" marker-end="url(#arrowhead)"/>`,
    )
  }
}

svgParts.push('</svg>')
const svgMarkup = svgParts.join('\n')
const svgPath = join(outDir, 'architecture.svg')
writeFileSync(svgPath, svgMarkup)
console.log('wrote', svgPath)

const htmlPath = writeWhiteboardPage(excalidrawPath)
console.log('wrote', htmlPath)
