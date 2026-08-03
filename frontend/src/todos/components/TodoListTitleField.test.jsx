import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TodoListTitleField } from './TodoListTitleField'

describe('TodoListTitleField', () => {
  it('materializes a blank draft once, when the title settles', async () => {
    const user = userEvent.setup()
    const onMaterialize = vi.fn()
    render(
      <TodoListTitleField
        title=''
        draft
        onMaterialize={onMaterialize}
        onTitleChange={vi.fn()}
        onCancelDraft={vi.fn()}
      />
    )

    const field = screen.getByLabelText('Todo List name')
    await user.type(field, '  Release')
    expect(onMaterialize).not.toHaveBeenCalled()

    await user.tab()
    expect(onMaterialize).toHaveBeenCalledTimes(1)
    expect(onMaterialize).toHaveBeenCalledWith('Release')
  })

  it('keeps a blank rename local and restores the saved title on blur', async () => {
    const user = userEvent.setup()
    const onTitleChange = vi.fn()
    const onAccept = vi.fn()
    render(
      <TodoListTitleField
        title='Release'
        onMaterialize={vi.fn()}
        onTitleChange={onTitleChange}
        onCancelDraft={vi.fn()}
        onAccept={onAccept}
      />
    )

    const field = screen.getByLabelText('Todo List name')
    await user.clear(field)
    expect(screen.getByText('Todo List name is required')).toBeInTheDocument()
    expect(onTitleChange).not.toHaveBeenCalledWith('')
    await user.tab()
    expect(field).toHaveValue('Release')
    expect(onAccept).not.toHaveBeenCalled()
  })

  it('accepts and trims on Enter, focuses the Todo composer, and cancels with Escape', async () => {
    const user = userEvent.setup()
    const onTitleChange = vi.fn()
    const onAccept = vi.fn()
    const { rerender } = render(
      <TodoListTitleField
        title='Release'
        onMaterialize={vi.fn()}
        onTitleChange={onTitleChange}
        onCancelDraft={vi.fn()}
        onAccept={onAccept}
      />
    )
    const field = screen.getByLabelText('Todo List name')
    await user.clear(field)
    await user.type(field, '  Renamed  {Enter}')
    expect(onTitleChange).toHaveBeenLastCalledWith('Renamed')
    expect(onAccept).toHaveBeenCalledTimes(1)

    rerender(
      <TodoListTitleField
        title='Renamed'
        onMaterialize={vi.fn()}
        onTitleChange={onTitleChange}
        onCancelDraft={vi.fn()}
        onAccept={onAccept}
      />
    )
    await user.clear(field)
    await user.type(field, 'Temporary{Escape}')
    expect(field).toHaveValue('Renamed')
  })
})
