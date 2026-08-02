import { fetchTodoReadModel, syncTodoLists } from './todoLists'
import { constants as HTTP } from 'node:http2'
import { ERROR_CODE, TODO_API_PATH } from '@web-interview/todos/protocol'

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
      status: HTTP.HTTP_STATUS_OK,
      json: vi.fn().mockResolvedValue({ basis: 1, todoLists }),
    })

    await expect(fetchTodoReadModel()).resolves.toEqual({ basis: 1, todoLists })
  })

  it('rejects an invalid successful response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: HTTP.HTTP_STATUS_OK,
      json: vi.fn().mockResolvedValue({ basis: 1, todoLists: { bad: true } }),
    })

    await expect(fetchTodoReadModel()).rejects.toMatchObject({
      code: ERROR_CODE.INVALID_RESPONSE,
      status: HTTP.HTTP_STATUS_OK,
    })
  })

  it('posts transaction batches and validates the response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: HTTP.HTTP_STATUS_OK,
      json: vi.fn().mockResolvedValue({
        basis: 1,
        todoLists,
        acceptedTransactionIds: [],
        rejectedTransactions: [],
      }),
    })

    await syncTodoLists({ basis: 1, transactions: [] })

    expect(global.fetch).toHaveBeenCalledWith(
      TODO_API_PATH.SYNC,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ basis: 1, transactions: [] }),
      })
    )
  })
})
