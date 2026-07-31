import {
  createTodo,
  formatDueStatus,
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

  describe('formatDueStatus', () => {
    const now = new Date(2026, 6, 31) // 31 Jul 2026 local

    it('returns null without a due date', () => {
      expect(formatDueStatus(null, now)).toBeNull()
    })

    it('labels today, remaining, and overdue', () => {
      expect(formatDueStatus('2026-07-31', now)).toBe('Due today')
      expect(formatDueStatus('2026-08-01', now)).toBe('1 day remaining')
      expect(formatDueStatus('2026-08-03', now)).toBe('3 days remaining')
      expect(formatDueStatus('2026-07-30', now)).toBe('1 day overdue')
      expect(formatDueStatus('2026-07-28', now)).toBe('3 days overdue')
    })
  })
})
