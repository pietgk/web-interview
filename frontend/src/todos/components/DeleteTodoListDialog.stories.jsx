import { useState } from 'react'
import { Button } from '@mui/material'
import { expect, fn, screen, userEvent, within } from 'storybook/test'
import DeleteTodoListDialog from './DeleteTodoListDialog'

/** @param {string} story */
const storyDocs = (story) => ({
  parameters: {
    docs: {
      description: { story },
    },
  },
})

/**
 * App mounts this dialog only while confirming (`<Dialog open>` is fixed).
 * Stories add a trigger so Docs is not covered by a modal backdrop.
 *
 * @param {import('react').ComponentProps<typeof DeleteTodoListDialog>} props
 */
const DeleteDialogStory = ({ todoList, onCancel, onConfirm }) => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open delete confirmation</Button>
      {open && (
        <DeleteTodoListDialog
          todoList={todoList}
          onCancel={() => {
            onCancel()
            setOpen(false)
          }}
          onConfirm={() => {
            onConfirm()
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

const meta = /** @type {import('@storybook/react-vite').Meta<typeof DeleteTodoListDialog>} */ ({
  title: 'Todos/DeleteTodoListDialog',
  component: DeleteTodoListDialog,
  args: {
    onCancel: fn(),
    onConfirm: fn(),
  },
  render: (args) => <DeleteDialogStory {...args} />,
  parameters: {
    docs: {
      description: {
        component: [
          '**DeleteTodoListDialog** is the confirm step for deleting a **populated** Todo List (empty lists delete without it). It shows the list title, how many Todos disappear with it, and Cancel / Delete Todo List.',
          'The Dialog is always `open`; the parent mounts and unmounts it. These stories add an **Open delete confirmation** button so Docs is usable — otherwise the modal backdrop covers the page. Plays assert copy and which callback fires — not that the dialog leaves the DOM (unmount is the parent/wrapper).',
        ].join('\n\n'),
      },
    },
  },
})

export default meta

export const OneTodo = /** @type {import('@storybook/react-vite').StoryObj<typeof DeleteTodoListDialog>} */ ({
  args: {
    todoList: {
      id: 'list',
      title: 'First List',
      todos: [{ id: 'todo', text: 'Buy milk', completed: false, dueDate: null }],
    },
  },
  ...storyDocs([
    '**Why:** Singular copy must match a one-Todo list, and Cancel must notify the parent.',
    '**See:** After opening, dialog title `Delete First List?` and body `1 Todo will also disappear.`; Cancel calls `onCancel`.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open delete confirmation' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete First List?' })
    await expect(dialog).toHaveTextContent('1 Todo will also disappear.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await expect(args.onCancel).toHaveBeenCalledTimes(1)
    await expect(args.onConfirm).not.toHaveBeenCalled()
  },
})

export const MultipleTodos = /** @type {import('@storybook/react-vite').StoryObj<typeof DeleteTodoListDialog>} */ ({
  args: {
    todoList: {
      id: 'list',
      title: 'Errands',
      todos: [
        { id: 'a', text: 'A', completed: false, dueDate: null },
        { id: 'b', text: 'B', completed: true, dueDate: null },
      ],
    },
  },
  ...storyDocs([
    '**Why:** Plural copy must match the Todo count, and confirm must notify the parent.',
    '**See:** After opening, dialog title `Delete Errands?` and body `2 Todos will also disappear.`; Delete Todo List calls `onConfirm`.',
  ].join(' ')),
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Open delete confirmation' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete Errands?' })
    await expect(dialog).toHaveTextContent('2 Todos will also disappear.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete Todo List' }))
    await expect(args.onConfirm).toHaveBeenCalledTimes(1)
    await expect(args.onCancel).not.toHaveBeenCalled()
  },
})
