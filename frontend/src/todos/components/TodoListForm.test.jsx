import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TodoListForm } from './TodoListForm'

const renderForm = (overrides = {}) => {
  const send = vi.fn()
  const props = {
    todoList: {
      id: 'list',
      title: 'Release',
      todos: [{ id: 'todo', text: 'Original', completed: false, dueDate: null }],
    },
    composerText: '',
    onMaterialize: vi.fn(),
    onTitleChange: vi.fn(),
    onCancelDraft: vi.fn(),
    send,
    ...overrides,
  }
  return { ...render(<TodoListForm {...props} />), props, send }
}

describe('TodoListForm', () => {
  it('renders one title field and emits Todo intent without a Save button', async () => {
    const user = userEvent.setup()
    const { send } = renderForm()

    expect(screen.getAllByLabelText('Todo List name')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()
    await user.clear(screen.getByLabelText('What to do?'))
    await user.type(screen.getByLabelText('What to do?'), 'Updated')
    await user.tab()
    expect(send).toHaveBeenCalledWith({
      type: 'TODO_PATCH',
      id: 'todo',
      patch: { text: 'Updated' },
    })
  })

  it('renders only the focused title field for an unmaterialized draft', () => {
    renderForm({
      draft: true,
      autoFocusTitle: true,
      todoList: { id: 'draft', title: '', todos: [] },
    })

    expect(screen.getByLabelText('Todo List name')).toHaveFocus()
    expect(screen.queryByLabelText('Add a todo')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Todo editor' })).not.toBeInTheDocument()
  })

  it('moves focus from an accepted title to Add a todo', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByLabelText('Todo List name'))
    await user.keyboard('{Enter}')
    expect(screen.getByLabelText('Add a todo')).toHaveFocus()
  })

  it('emits composer changes and submit from the ghost row', async () => {
    const user = userEvent.setup()
    const { send } = renderForm()

    await user.type(screen.getByLabelText('Add a todo'), 'New')
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'COMPOSER_CHANGE' }))
    await user.click(screen.getByRole('button', { name: 'Add todo' }))
    expect(send).toHaveBeenCalledWith({ type: 'COMPOSER_SUBMIT' })
  })
})
