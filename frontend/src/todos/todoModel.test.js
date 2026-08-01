import {
  createTodo,
  formatDueStatus,
  getDueStatus,
  isDematerializableTodo,
  isListCompleted,
  removeTodoAt,
  updateTodoAt,
} from './todoModel'

describe('todoModel', () => {
  describe('createTodo', () => {
    it('creates a todo with defaults', () => {
      const todo = createTodo({ id: 'fixed-id' })
      expect(todo).toEqual({
        id: 'fixed-id',
        text: '',
        completed: false,
        dueDate: null,
      })
    })
  })

  describe('isDematerializableTodo', () => {
    it('is true for blank text without completed or dueDate', () => {
      expect(isDematerializableTodo(createTodo({ id: '1', text: '   ' }))).toBe(true)
    })

    it('is false when completed or dueDate is set', () => {
      expect(
        isDematerializableTodo(createTodo({ id: '1', text: '', completed: true }))
      ).toBe(false)
      expect(
        isDematerializableTodo(createTodo({ id: '1', text: '', dueDate: '2099-01-01' }))
      ).toBe(false)
    })
  })

  describe('isListCompleted', () => {
    it('is false for an empty list', () => {
      expect(isListCompleted([])).toBe(false)
    })

    it('is true when every todo is completed', () => {
      expect(
        isListCompleted([
          createTodo({ id: '1', completed: true }),
          createTodo({ id: '2', completed: true }),
        ])
      ).toBe(true)
    })

    it('is false when any todo is incomplete', () => {
      expect(
        isListCompleted([
          createTodo({ id: '1', completed: true }),
          createTodo({ id: '2', completed: false }),
        ])
      ).toBe(false)
    })
  })

  describe('updateTodoAt / removeTodoAt', () => {
    const todos = [
      createTodo({ id: 'a', text: 'A' }),
      createTodo({ id: 'b', text: 'B' }),
    ]

    it('updates a todo immutably', () => {
      const next = updateTodoAt(todos, 0, { text: 'Updated', completed: true })
      expect(next[0]).toEqual({
        id: 'a',
        text: 'Updated',
        completed: true,
        dueDate: null,
      })
      expect(todos[0].text).toBe('A')
    })

    it('removes a todo immutably', () => {
      expect(removeTodoAt(todos, 0).map((t) => t.id)).toEqual(['b'])
      expect(todos).toHaveLength(2)
    })
  })

  describe('getDueStatus', () => {
    const now = new Date(2026, 6, 31) // 31 Jul 2026 local

    it.each([
      [null, false, null],
      ['2026-07-31', false, { kind: 'today', label: 'Due today', days: 0 }],
      ['2026-08-01', false, { kind: 'remaining', label: '1 day remaining', days: 1 }],
      ['2026-08-03', false, { kind: 'remaining', label: '3 days remaining', days: 3 }],
      ['2026-07-30', false, { kind: 'overdue', label: '1 day overdue', days: -1 }],
      ['2026-07-28', false, { kind: 'overdue', label: '3 days overdue', days: -3 }],
      ['2026-07-30', true, { kind: 'completed', label: 'Completed', days: null }],
    ])('dueDate %s completed=%s', (dueDate, completed, expected) => {
      expect(getDueStatus(dueDate, { completed, now })).toEqual(expected)
    })

    it('does not describe a completed todo as overdue', () => {
      const status = getDueStatus('2026-07-30', { completed: true, now })
      expect(status.kind).toBe('completed')
      expect(status.label).not.toMatch(/overdue/i)
    })

    it('formatDueStatus still returns labels', () => {
      expect(formatDueStatus(null, now)).toBeNull()
      expect(formatDueStatus('2026-07-31', now)).toBe('Due today')
      expect(formatDueStatus('2026-07-30', now, true)).toBe('Completed')
    })
  })
})
