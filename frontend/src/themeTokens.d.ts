import '@mui/material/styles'

/**
 * Design tokens this app owns. Anything here is a decision we made; anything
 * reached through the rest of the theme is a decision MUI made for us.
 */
export interface TodoTokens {
  /** Geometry shared by inputs and the input-shaped controls that sit beside them. */
  control: {
    height: string
    borderOpacity: number
    focusBorderWidth: string
    labelNotchPadding: string
  }
  /** Widths that make a Todo row line up as columns rather than as coincidence. */
  field: {
    completion: string
    dueDate: string
    textMin: string
  }
  /**
   * Page-level measure and edge spacing. `gutter` is in theme spacing units.
   * `backdrop` is set only where the mode needs one of its own; fall back to
   * `palette.background.default`.
   */
  layout: {
    maxWidth: string
    gutter: number
    backdrop?: string
  }
  /** `actionClearance` is in theme spacing units. */
  listRow: {
    actionClearance: number
  }
  /** What a control must mirror to paint its own patch of the card it sits on. */
  surface: {
    elevatedOverlay: number
  }
  emphasis: {
    muted: number
  }
  /**
   * Replaces resting border / muted opacities under `prefers-contrast: more`.
   */
  contrastMore: {
    borderOpacity: number
    muted: number
  }
}

declare module '@mui/material/styles' {
  interface Theme {
    todos: TodoTokens
  }

  interface ThemeOptions {
    todos?: TodoTokens
  }
}
