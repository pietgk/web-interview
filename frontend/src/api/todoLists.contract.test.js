import { parseTodoLists } from '@web-interview/todo-contract'

describe('API response contract', () => {
  it('rejects invalid todo list responses at the boundary', () => {
    const parsed = parseTodoLists({
      '1': {
        id: '1',
        title: 'Bad',
        todos: [
          { id: 't1', text: 'A', completed: false, dueDate: '2026-02-31' },
        ],
      },
    })

    expect(parsed.ok).toBe(false)
    expect(parsed.body.code).toBe('VALIDATION_ERROR')
  })

  it('accepts valid seeded-shaped responses', () => {
    const parsed = parseTodoLists({
      '0000000001': {
        id: '0000000001',
        title: 'First List',
        todos: [
          {
            id: '0000000001-todo-1',
            text: 'First todo of first list!',
            completed: false,
            dueDate: null,
          },
        ],
      },
    })

    expect(parsed.ok).toBe(true)
  })
})
