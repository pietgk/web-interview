import { render, screen } from '@testing-library/react'
import App from './App'
import { useTodoLists } from './todos/useTodoLists'

vi.mock('./todos/useTodoLists', () => ({ useTodoLists: vi.fn() }))
vi.mock('./todos/components/StatusBar', () => ({
  /** @param {{runtime: {clientId: string}}} props */
  StatusBar: ({ runtime }) => <div data-testid='status-runtime'>{runtime.clientId}</div>,
}))
vi.mock('./todos/components/TodoLists', () => ({
  /** @param {{runtime: {clientId: string}}} props */
  TodoLists: ({ runtime }) => <div data-testid='lists-runtime'>{runtime.clientId}</div>,
}))

it('creates one Todo runtime and shares it with StatusBar and TodoLists', () => {
  vi.mocked(useTodoLists).mockReturnValue(/** @type {ReturnType<typeof useTodoLists>} */ ({
    clientId: 'one-runtime',
  }))

  render(<App />)

  expect(useTodoLists).toHaveBeenCalledTimes(1)
  expect(screen.getByTestId('status-runtime')).toHaveTextContent('one-runtime')
  expect(screen.getByTestId('lists-runtime')).toHaveTextContent('one-runtime')
})
