import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { TodoListForm } from './TodoListForm'
import { createTodo } from '../todoModel'
import { SAVE_STATUS } from '../todoListsState'

const StatefulForm = ({
  initialTodos,
  saveStatus = SAVE_STATUS.CLEAN,
  saveError = null,
  onTodosChange,
  onRetry,
  onBlurSave,
}) => {
  const [todos, setTodos] = useState(initialTodos)
  return (
    <TodoListForm
      todoList={{ id: '0000000001', title: 'First List', todos }}
      saveStatus={saveStatus}
      saveError={saveError}
      onTodosChange={(next) => {
        setTodos(next)
        onTodosChange?.(next)
      }}
      onRetry={onRetry}
      onBlurSave={onBlurSave}
    />
  )
}

describe('TodoListForm', () => {
  it('persists through onTodosChange without a Save button', async () => {
    const user = userEvent.setup()
    const onTodosChange = jest.fn()

    render(
      <StatefulForm
        initialTodos={[createTodo({ id: 't1', text: 'Original' })]}
        onTodosChange={onTodosChange}
      />
    )

    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText('What to do?'))
    await user.type(screen.getByLabelText('What to do?'), 'Updated')

    expect(onTodosChange).toHaveBeenCalled()
    const lastCall = onTodosChange.mock.calls.at(-1)[0]
    expect(lastCall[0]).toEqual(expect.objectContaining({ id: 't1', text: 'Updated' }))
  })

  it('shows Retry when save failed and keeps the draft visible', async () => {
    const user = userEvent.setup()
    const onRetry = jest.fn()

    render(
      <StatefulForm
        initialTodos={[createTodo({ id: 't1', text: 'Unsaved edit' })]}
        saveStatus={SAVE_STATUS.ERROR}
        saveError='network down'
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
          saveStatus={SAVE_STATUS.DIRTY}
          onTodosChange={(next) => {
            latestTodos = next
            setTodos(next)
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
