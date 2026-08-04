import React from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material'

/** @param {{todoList: import('@web-interview/todos/types').TodoList, onCancel: () => void, onConfirm: () => void}} props */
const DeleteTodoListDialog = ({ todoList, onCancel, onConfirm }) => (
  <Dialog
    open
    onClose={onCancel}
    aria-labelledby='delete-todo-list-title'
  >
    <DialogTitle id='delete-todo-list-title'>Delete {todoList.title}?</DialogTitle>
    <DialogContent>
      <DialogContentText>
        {todoList.todos.length} {todoList.todos.length === 1 ? 'Todo' : 'Todos'} will also disappear.
      </DialogContentText>
    </DialogContent>
    <DialogActions>
      <Button onClick={onCancel}>Cancel</Button>
      <Button color='error' variant='contained' onClick={onConfirm}>
        Delete Todo List
      </Button>
    </DialogActions>
  </Dialog>
)

export default DeleteTodoListDialog
