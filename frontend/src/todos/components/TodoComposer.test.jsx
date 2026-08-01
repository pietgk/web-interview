import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TodoComposer } from './TodoComposer'

describe('TodoComposer', () => {
  it('emits text changes and submits via Enter and Add', async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    const onSubmit = jest.fn()

    render(<TodoComposer text='' onChange={onChange} onSubmit={onSubmit} />)

    expect(screen.getByLabelText('Add a todo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add todo' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/Mark completed/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Delete todo/)).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Add a todo'), 'A')
    expect(onChange).toHaveBeenCalledWith('A')

    await user.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Add todo' }))
    expect(onSubmit).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText('Add a todo')).toHaveFocus()
  })
})
