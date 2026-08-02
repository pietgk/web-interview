import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CompletionField } from './CompletionField'

describe('CompletionField', () => {
  it('toggles when its outlined field is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <CompletionField
        completed={false}
        onChange={onChange}
        todoLabel='Buy milk'
      />
    )

    await user.click(screen.getByText('Done'))

    expect(onChange).toHaveBeenCalledWith(true)
    expect(screen.getByLabelText('Mark completed: Buy milk')).not.toBeChecked()
  })
})
