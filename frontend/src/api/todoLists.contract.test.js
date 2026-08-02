import { fetchTodoReadModel, syncTodoLists } from './todoLists'

const originalFetch = global.fetch

afterEach(() => {
  global.fetch = originalFetch
})

const todoLists = {
  '0000000001': {
    id: '0000000001',
    title: 'First List',
    todos: [
      {
        id: 'todo-1',
        text: 'First todo',
        completed: false,
        dueDate: null,
      },
    ],
  },
}

describe('todo sync API contract', () => {
  it('validates read-model responses', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ basis: 1, todoLists }),
    })

    await expect(fetchTodoReadModel()).resolves.toEqual({ basis: 1, todoLists })
  })

  it('rejects an invalid successful response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ basis: 1, todoLists: { bad: true } }),
    })

    await expect(fetchTodoReadModel()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      status: 200,
    })
  })

  it('posts transaction batches and validates the response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        basis: 1,
        todoLists,
        acceptedTransactionIds: [],
        rejectedTransactions: [],
      }),
    })

    await syncTodoLists({ basis: 1, transactions: [] })

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/todo-lists/sync',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ basis: 1, transactions: [] }),
      })
    )
  })
})
