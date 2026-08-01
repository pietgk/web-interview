import { createActor } from 'xstate'
import { AUTOSAVE_DEBOUNCE_MS } from './todoListMachine'
import {
  createTodoListsMachine,
  hasUnackedChanges,
  selectVisibleLists,
} from './todoListsMachine'
import { createTodo } from './todoModel'

const flushMicrotasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

const seedLists = {
  a: {
    id: 'a',
    title: 'A',
    todos: [createTodo({ id: '1', text: 'A item' })],
  },
  b: {
    id: 'b',
    title: 'B',
    todos: [createTodo({ id: '2', text: 'B item' })],
  },
}

describe('todoListsMachine', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('loads lists and derives completion from the active draft', async () => {
    const fetchTodoLists = jest.fn().mockResolvedValue(seedLists)
    const saveTodoList = jest.fn().mockResolvedValue(seedLists.a)
    const actor = createActor(
      createTodoListsMachine({ fetchTodoLists, saveTodoList })
    )
    actor.start()

    await flushMicrotasks()
    expect(actor.getSnapshot().value).toBe('ready')

    actor.send({ type: 'SELECT_LIST', id: 'a' })
    actor.send({
      type: 'FORWARD',
      event: { type: 'TODO_PATCH', id: '1', patch: { completed: true } },
    })

    const visible = selectVisibleLists(actor.getSnapshot())
    expect(visible.find((list) => list.id === 'a').completed).toBe(true)

    actor.stop()
  })

  it('flushes the previous list when switching before debounce', async () => {
    const fetchTodoLists = jest.fn().mockResolvedValue(seedLists)
    const saveTodoList = jest.fn().mockImplementation(async (id, { todos }) => ({
      id,
      title: seedLists[id].title,
      todos,
    }))
    const actor = createActor(
      createTodoListsMachine({ fetchTodoLists, saveTodoList })
    )
    actor.start()
    await flushMicrotasks()

    actor.send({ type: 'SELECT_LIST', id: 'a' })
    actor.send({
      type: 'FORWARD',
      event: { type: 'TODO_PATCH', id: '1', patch: { text: 'Edited A' } },
    })
    expect(saveTodoList).not.toHaveBeenCalled()

    actor.send({ type: 'SELECT_LIST', id: 'b' })
    await flushMicrotasks()

    expect(saveTodoList).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({
        todos: [expect.objectContaining({ text: 'Edited A' })],
      })
    )

    const listA = actor.getSnapshot().context.listRefs.a.getSnapshot()
    expect(listA.context.draft[0].text).toBe('Edited A')
    expect(actor.getSnapshot().context.activeListId).toBe('b')

    actor.stop()
  })

  it('reports unacked changes while dirty', async () => {
    const fetchTodoLists = jest.fn().mockResolvedValue(seedLists)
    const saveTodoList = jest.fn().mockResolvedValue(seedLists.a)
    const actor = createActor(
      createTodoListsMachine({ fetchTodoLists, saveTodoList })
    )
    actor.start()
    await flushMicrotasks()

    actor.send({ type: 'SELECT_LIST', id: 'a' })
    actor.send({
      type: 'FORWARD',
      event: { type: 'TODO_PATCH', id: '1', patch: { text: 'dirty' } },
    })

    expect(hasUnackedChanges(actor.getSnapshot())).toBe(true)

    jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
    await flushMicrotasks()
    expect(hasUnackedChanges(actor.getSnapshot())).toBe(false)

    actor.stop()
  })
})
