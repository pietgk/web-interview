import React from 'react'
import { AppBar, Toolbar, Typography } from '@mui/material'
import { TodoLists } from './todos/components/TodoLists'

const MainAppBar = () => {
  return (
    <AppBar position='static' color='primary'>
      <Toolbar>
        <Typography variant='h6' component='h1' color='inherit'>
          Things to do
        </Typography>
      </Toolbar>
    </AppBar>
  )
}

/** @type {React.CSSProperties} */
const mainWrapperStyle = { display: 'flex', flexDirection: 'column' }
/** @type {React.CSSProperties} */
const centerContentWrapper = { display: 'flex', justifyContent: 'center' }
/** @type {React.CSSProperties} */
const contentWrapperStyle = {
  display: 'flex',
  flexDirection: 'column',
  maxWidth: '80rem',
  flexGrow: 1,
}
const MainWrapper = ({ children }) => {
  return (
    <div style={mainWrapperStyle}>
      <MainAppBar />
      <div style={centerContentWrapper}>
        <div style={contentWrapperStyle}>
          <main>{children}</main>
        </div>
      </div>
    </div>
  )
}

const App = () => {
  return (
    <MainWrapper>
      <TodoLists style={{ margin: '1rem' }} />
    </MainWrapper>
  )
}

export default App
