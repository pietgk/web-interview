import { createTheme } from '@mui/material/styles'

/** Shared MUI themes for the app and Storybook (palette.mode is the light/dark switch). */
export const lightTheme = createTheme({
  palette: {
    mode: 'light',
  },
})

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
  },
})
