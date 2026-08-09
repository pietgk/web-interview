import { createTheme } from '@mui/material/styles'

/**
 * The height MUI gives an outlined input at default density.
 *
 * CompletionField is not an input, so it cannot inherit this - it mirrors the
 * value to sit on the same baseline as the fields beside it. Written in rem so
 * it scales with the browser font size like everything else here.
 *
 * Mirrored values drift silently, so `theme.stories.jsx` measures a real
 * TextField against this and fails when MUI moves.
 */
const CONTROL_HEIGHT = '3.5rem'

/** Alpha MUI uses for a resting outlined border, over `palette.text.primary`. */
const CONTROL_BORDER_OPACITY = 0.23

/** Width MUI gives a focused outlined border, which the completion box mirrors. */
const CONTROL_FOCUS_BORDER_WIDTH = '2px'

/** How far a floating label's background reaches past its text to clear the border. */
const CONTROL_LABEL_NOTCH_PADDING = '4px'

/** Wide enough for the checkbox and the notch cut by its shrunk 'Done' label. */
const COMPLETION_FIELD_WIDTH = '5rem'

/** Fits a native date input plus the picker affordance the browser adds. */
const DUE_DATE_FIELD_WIDTH = '11rem'

/** Below this a Todo's text is unreadable, so the row wraps instead of shrinking. */
const TODO_TEXT_MIN_WIDTH = '12rem'

/** Longest comfortable reading measure before the page stops feeling like a page. */
const PAGE_MAX_WIDTH = '80rem'

/** Spacing units of breathing room between the page edge and its cards. */
const PAGE_GUTTER = 2

/** Spacing units of right padding so list text never runs under the delete button. */
const LIST_ACTION_CLEARANCE = 7

/** Decorative separators should read as texture rather than as content. */
const MUTED_EMPHASIS_OPACITY = 0.45

/**
 * A hair of grey behind the cards so their edges read without leaning on the
 * shadow alone. `index.html` used to hard-code this on `<body>`, where an inline
 * style outranked CssBaseline and left the page light behind dark cards.
 *
 * It belongs to the page shell rather than to `palette.background.default`:
 * as a palette default it would also become the canvas Storybook renders a lone
 * component on, and `primary.main` only reaches 4.07:1 against it. On the
 * `paper` a field actually sits on, the same label clears AA comfortably.
 *
 * Dark mode has no backdrop of its own - `background.default` is already darker
 * than `paper`, which is the separation this exists to buy.
 */
const LIGHT_PAGE_BACKDROP = '#f1f1f1'

/**
 * White MUI lays over `background.paper` to make an elevation-1 surface in dark
 * mode - `4.5 * ln(2) + 2` percent, which is the Card every field here sits on.
 *
 * Anything that paints its own patch of that surface has to mirror this, or it
 * shows up as a darker rectangle against the card.
 */
const ELEVATED_SURFACE_OVERLAY = 0.05

/**
 * Tokens this app owns, under one namespace so they cannot collide with MUI's
 * own theme keys. Reach them from any `sx` callback as `theme.todos.*`; the
 * shape is declared in `themeTokens.d.ts` - which cannot be named `theme.d.ts`,
 * because TypeScript would read it as the declaration file for this module and
 * hide these exports.
 *
 * @type {import('@mui/material/styles').ThemeOptions}
 */
const foundations = {
  todos: {
    control: {
      height: CONTROL_HEIGHT,
      borderOpacity: CONTROL_BORDER_OPACITY,
      focusBorderWidth: CONTROL_FOCUS_BORDER_WIDTH,
      labelNotchPadding: CONTROL_LABEL_NOTCH_PADDING,
    },
    field: {
      completion: COMPLETION_FIELD_WIDTH,
      dueDate: DUE_DATE_FIELD_WIDTH,
      textMin: TODO_TEXT_MIN_WIDTH,
    },
    layout: {
      maxWidth: PAGE_MAX_WIDTH,
      gutter: PAGE_GUTTER,
    },
    listRow: {
      actionClearance: LIST_ACTION_CLEARANCE,
    },
    surface: {
      elevatedOverlay: ELEVATED_SURFACE_OVERLAY,
    },
    emphasis: {
      muted: MUTED_EMPHASIS_OPACITY,
    },
  },
}

/** Shared MUI themes for the app and Storybook (palette.mode is the light/dark switch). */
export const lightTheme = createTheme(
  { ...foundations, palette: { mode: 'light' } },
  { todos: { layout: { backdrop: LIGHT_PAGE_BACKDROP } } }
)

export const darkTheme = createTheme({ ...foundations, palette: { mode: 'dark' } })
