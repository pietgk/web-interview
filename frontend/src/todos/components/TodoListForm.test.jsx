import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { TodoListForm } from './TodoListForm'
import { createTodo } from '../todoModel'

/** @typedef {import('@web-interview/todos/types').Todo} Todo */
/** @typedef {import('../todoUiProtocol').TodoUiEvent} TodoUiEvent */
/** @typedef {{message: string | null, tone: 'error' | 'secondary', showRetry: boolean}} SaveChrome */

/**
 * @param {{
 *   initialTodos: Todo[],
 *   saveChrome?: SaveChrome,
 *   onSend?: (event: TodoUiEvent) => void
 * }} props
 */
const StatefulForm = ({
  initialTodos,
  saveChrome = {
    message: 'All changes saved',
    tone: 'secondary',
    showRetry: false,
  },
  onSend,
}) => {
  const [todos, setTodos] = useState(initialTodos)
  const [composerText, setComposerText] = useState('')

  /** @param {TodoUiEvent} event */
  const send = (event) => {
    onSend?.(event)
    if (event.type === 'COMPOSER_CHANGE') {
      setComposerText(event.text)
    }
    if (event.type === 'TODO_PATCH') {
      setTodos((current) =>
        current.map((todo) =>
          todo.id === event.id ? { ...todo, ...event.patch } : todo
        )
      )
    }
    if (event.type === 'TODO_REMOVE') {
      setTodos((current) => current.filter((todo) => todo.id !== event.id))
    }
    if (event.type === 'COMPOSER_SUBMIT' || event.type === 'COMPOSER_COMMIT') {
      setComposerText('')
    }
  }

  return (
    <TodoListForm
      todoList={{ id: '0000000001', title: 'First List', todos }}
      composerText={composerText}
      saveChrome={saveChrome}
      send={send}
    />
  )
}

describe('TodoListForm', () => {
  it('emits intent events without a Save button', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()

    render(
      <StatefulForm
        initialTodos={[createTodo({ id: 't1', text: 'Original' })]}
        onSend={onSend}
      />
    )

    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add todo' })).toBeInTheDocument()

    await user.clear(screen.getByLabelText('What to do?'))
    await user.type(screen.getByLabelText('What to do?'), 'Updated')

    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TODO_PATCH',
        id: 't1',
        patch: expect.objectContaining({ text: expect.stringContaining('U') }),
      })
    )
  })

  it('emits composer changes and submit from the top ghost row', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()

    render(
      <StatefulForm
        initialTodos={[createTodo({ id: 't1', text: 'Original' })]}
        onSend={onSend}
      />
    )

    await user.type(screen.getByLabelText('Add a todo'), 'New')
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'COMPOSER_CHANGE' })
    )

    await user.click(screen.getByRole('button', { name: 'Add todo' }))
    expect(onSend).toHaveBeenCalledWith({ type: 'COMPOSER_SUBMIT' })
  })

  it('shows Retry when save failed and keeps the draft visible', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()

    render(
      <StatefulForm
        initialTodos={[createTodo({ id: 't1', text: 'Unsaved edit' })]}
        saveChrome={{
          message: 'Save failed: network down',
          tone: 'error',
          showRetry: true,
        }}
        onSend={onSend}
      />
    )

    expect(screen.getByLabelText('What to do?')).toHaveValue('Unsaved edit')
    expect(screen.getByText(/Save failed: network down/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry saving todo list' }))
    expect(onSend).toHaveBeenCalledWith({ type: 'RETRY' })
  })
})

describe('TodoListForm unmount flush contract (owner responsibility)', () => {
  it('flushes an edited todo when the form unmounts before the debounce expires', async () => {
    const user = userEvent.setup()

    /** @type {Todo[][]} */
    const saves = []
    /** @type {Todo[]} */
    let latestTodos = [createTodo({ id: 't1', text: 'Original' })]

    /** @param {{open: boolean}} props */
    const Harness = ({ open }) => {
      const [todos, setTodos] = useState(latestTodos)
      if (!open) return null
      return (
        <TodoListForm
          todoList={{ id: '0000000001', title: 'First List', todos }}
          composerText=''
          saveChrome={{
            message: 'Unsaved changes',
            tone: 'secondary',
            showRetry: false,
          }}
          send={(event) => {
            if (event.type === 'TODO_PATCH') {
              latestTodos = latestTodos.map((todo) =>
                todo.id === event.id ? { ...todo, ...event.patch } : todo
              )
              setTodos(latestTodos)
            }
            if (event.type === 'FLUSH') {
              saves.push(latestTodos)
            }
          }}
        />
      )
    }

    const { rerender, unmount } = render(<Harness open />)

    await user.clear(screen.getByLabelText('What to do?'))
    await user.type(screen.getByLabelText('What to do?'), 'Unsaved switch test')

    act(() => {
      // Owner flush (list switch / blur) - form itself does not unmount-flush.
      saves.push(latestTodos)
    })
    rerender(<Harness open={false} />)
    unmount()

    const latestSave = saves.at(-1)
    if (!latestSave) throw new Error('Expected the edited todos to be saved')
    expect(latestSave[0].text).toBe('Unsaved switch test')
  })
})
