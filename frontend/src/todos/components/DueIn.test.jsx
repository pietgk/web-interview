import { render, screen } from '@testing-library/react'
import { DueIn } from './DueIn'

describe('DueIn', () => {
  const now = new Date(2026, 6, 31)

  it.each([
    [null, false, 'Due date'],
    ['2026-07-31', false, 'Due today'],
    ['2026-08-01', false, 'Due in 1 day'],
    ['2026-08-03', false, 'Due in 3 days'],
    ['2026-09-14', false, 'Due in 1 month'],
    ['2028-01-30', false, 'Due in 2 years'],
    ['2099-01-15', false, 'Due in 72 years'],
    ['2026-07-30', false, '1 day overdue'],
    ['2026-07-28', false, '3 days overdue'],
    ['2026-06-16', false, '1 month overdue'],
    ['2026-07-30', true, 'Due date'],
  ])(
    'labels %s with completed=%s as %s',
    (dueDate, completed, expectedLabel) => {
      render(
        <DueIn
          dueDate={dueDate}
          completed={completed}
          onChange={vi.fn()}
          todoLabel='Buy milk'
          now={now}
        />
      )

      expect(
        screen.getByLabelText(`${expectedLabel}: Buy milk`)
      ).toBeInTheDocument()
    }
  )
})
