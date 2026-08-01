import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { TodoListForm } from './TodoListForm'
import { createTodo } from '../todoModel'

const StatefulForm = ({
  initialTodos,
  saveChrome = {
    message: 'All changes saved',
    tone: 'secondary',
    showRetry: false,
  },
  onTodoPatch,
  onTodoRemove,
  onComposerChange,
  onRetry,
  onBlurSave,
}) => {
  const [todos, setTodos] = useState(initialTodos)
  const [composerText, setComposerText] = useState('')
  return (
    <TodoListForm
      todoList={{ id: '0000000001', title: 'First List', todos }}
      composerText={composerText}
      saveChrome={saveChrome}
      onComposerChange={(text) => {
        setComposerText(text)
        onComposerChange?.(text)
      }}
      onTodoPatch={(id, patch) => {
        setTodos((current) =>
          current.map((todo) => (todo.id === id ? { ...todo, ...patch } : todo))
        )
        onTodoPatch?.(id, patch)
      }}
      onTodoRemove={(id) => {
        setTodos((current) => current.filter((todo) => todo.id !== id))
        onTodoRemove?.(id)
      }}
      onRetry={onRetry}
      onBlurSave={onBlurSave}
    />
  )
}

describe('TodoListForm', () => {
  it('emits intent patches without a Save or Add button', async () => {
    const user = userEvent.setup()
    const onTodoPatch = jest.fn()

    render(
      <StatefulForm
        initialTodos={[createTodo({ id: 't1', text: 'Original' })]}
        onTodoPatch={onTodoPatch}
      />
    )

    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add todo/i })).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('What to do?'))
    await user.type(screen.getByLabelText('What to do?'), 'Updated')

    expect(onTodoPatch).toHaveBeenCalled()
    expect(onTodoPatch).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ text: expect.stringContaining('U') })
    )
  })

  it('emits composer changes from the top ghost row', async () => {
    const user = userEvent.setup()
    const onComposerChange = jest.fn()

    render(
      <StatefulForm
        initialTodos={[createTodo({ id: 't1', text: 'Original' })]}
        onComposerChange={onComposerChange}
      />
    )

    await user.type(screen.getByLabelText('Add a todo'), 'New')
    expect(onComposerChange).toHaveBeenCalled()
    expect(onComposerChange.mock.calls.at(-1)[0]).toContain('N')
  })

  it('shows Retry when save failed and keeps the draft visible', async () => {
    const user = userEvent.setup()
    const onRetry = jest.fn()

    render(
      <StatefulForm
        initialTodos={[createTodo({ id: 't1', text: 'Unsaved edit' })]}
        saveChrome={{
          message: 'Save failed: network down',
          tone: 'error',
          showRetry: true,
        }}
        onRetry={onRetry}
      />
    )

    expect(screen.getByLabelText('What to do?')).toHaveValue('Unsaved edit')
    expect(screen.getByText(/Save failed: network down/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry saving todo list' }))
    expect(onRetry).toHaveBeenCalled()
  })
})

describe('TodoListForm unmount flush contract (owner responsibility)', () => {
  it('flushes an edited todo when the form unmounts before the debounce expires', async () => {
    jest.useFakeTimers()
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })

    const saves = []
    const flush = jest.fn(() => {
      saves.push(latestTodos)
    })
    let latestTodos = [createTodo({ id: 't1', text: 'Original' })]

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
          onTodoPatch={(id, patch) => {
            latestTodos = latestTodos.map((todo) =>
              todo.id === id ? { ...todo, ...patch } : todo
            )
            setTodos(latestTodos)
          }}
          onBlurSave={flush}
        />
      )
    }

    const { rerender, unmount } = render(<Harness open />)

    await user.clear(screen.getByLabelText('What to do?'))
    await user.type(screen.getByLabelText('What to do?'), 'Unsaved switch test')

    act(() => {
      flush()
    })
    rerender(<Harness open={false} />)
    unmount()

    expect(flush).toHaveBeenCalled()
    expect(saves.at(-1)[0].text).toBe('Unsaved switch test')

    jest.useRealTimers()
  })
})
