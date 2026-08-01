import { createActor } from 'xstate'
import {
  AUTOSAVE_DEBOUNCE_MS,
  createTodoListsMachine,
  hasUnackedChanges,
  selectViewModel,
  selectVisibleTodos,
} from './todoListsMachine'
import { createTodo } from './todoModel'

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

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

const startCatalog = async ({
  fetchTodoLists = jest.fn().mockResolvedValue(seedLists),
  saveTodoList = jest.fn().mockResolvedValue(seedLists.a),
} = {}) => {
  const actor = createActor(createTodoListsMachine({ fetchTodoLists, saveTodoList }))
  actor.start()
  await flushMicrotasks()
  return { actor, fetchTodoLists, saveTodoList }
}

const activeEntry = (actor) => actor.getSnapshot().context.lists[actor.getSnapshot().context.activeListId]

describe('todoListsMachine', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('loads lists and derives completion from the active draft', async () => {
    const { actor } = await startCatalog()
    expect(actor.getSnapshot().matches('ready')).toBe(true)

    actor.send({ type: 'SELECT_LIST', id: 'a' })
    actor.send({ type: 'TODO_PATCH', id: '1', patch: { completed: true } })

    const { lists } = selectViewModel(actor.getSnapshot())
    expect(lists.find((list) => list.id === 'a').completed).toBe(true)

    actor.stop()
  })

  it('debounces saves and coalesces rapid edits', async () => {
    const saveTodoList = jest.fn().mockResolvedValue({
      id: 'a',
      title: 'A',
      todos: [],
    })
    const { actor } = await startCatalog({ saveTodoList })

    actor.send({ type: 'SELECT_LIST', id: 'a' })
    actor.send({ type: 'TODO_PATCH', id: '1', patch: { text: 'a' } })
    actor.send({ type: 'TODO_PATCH', id: '1', patch: { text: 'ab' } })
    actor.send({ type: 'TODO_PATCH', id: '1', patch: { text: 'abc' } })

    expect(saveTodoList).not.toHaveBeenCalled()
    expect(activeEntry(actor).status).toBe('dirty')

    jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
    await flushMicrotasks()

    expect(saveTodoList).toHaveBeenCalledTimes(1)
    expect(saveTodoList).toHaveBeenCalledWith('a', {
      todos: [expect.objectContaining({ text: 'abc' })],
    })
    expect(activeEntry(actor).status).toBe('clean')

    actor.stop()
  })

  it('flushes the previous list when switching before debounce', async () => {
    const saveTodoList = jest.fn().mockImplementation(async (id, { todos }) => ({
      id,
      title: seedLists[id].title,
      todos,
    }))
    const { actor } = await startCatalog({ saveTodoList })

    actor.send({ type: 'SELECT_LIST', id: 'a' })
    actor.send({ type: 'TODO_PATCH', id: '1', patch: { text: 'Edited A' } })
    expect(saveTodoList).not.toHaveBeenCalled()

    actor.send({ type: 'SELECT_LIST', id: 'b' })
    await flushMicrotasks()

    expect(saveTodoList).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({
        todos: [expect.objectContaining({ text: 'Edited A' })],
      })
    )
    expect(actor.getSnapshot().context.lists.a.draft[0].text).toBe('Edited A')
    expect(actor.getSnapshot().context.activeListId).toBe('b')

    actor.stop()
  })

  it('serializes overlapping saves and keeps the newest draft', async () => {
    const first = deferred()
    const second = deferred()
    const saveTodoList = jest
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const { actor } = await startCatalog({ saveTodoList })
    actor.send({ type: 'SELECT_LIST', id: 'a' })

    actor.send({ type: 'TODO_PATCH', id: '1', patch: { text: 'old' } })
    actor.send({ type: 'FLUSH_ACTIVE' })
    await flushMicrotasks()
    expect(saveTodoList).toHaveBeenCalledTimes(1)

    actor.send({ type: 'TODO_PATCH', id: '1', patch: { text: 'new' } })
    expect(saveTodoList).toHaveBeenCalledTimes(1)

    first.resolve({
      id: 'a',
      title: 'A',
      todos: [createTodo({ id: '1', text: 'old' })],
    })
    await flushMicrotasks()

    expect(saveTodoList).toHaveBeenCalledTimes(2)
    expect(saveTodoList).toHaveBeenLastCalledWith('a', {
      todos: [expect.objectContaining({ text: 'new' })],
    })

    second.resolve({
      id: 'a',
      title: 'A',
      todos: [createTodo({ id: '1', text: 'new' })],
    })
    await flushMicrotasks()

    expect(activeEntry(actor).draft[0].text).toBe('new')
    expect(activeEntry(actor).status).toBe('clean')

    actor.stop()
  })

  it('retries immediately after a failure', async () => {
    const saveTodoList = jest
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        id: 'a',
        title: 'A',
        todos: [createTodo({ id: '1', text: 'ok' })],
      })

    const { actor } = await startCatalog({ saveTodoList })
    actor.send({ type: 'SELECT_LIST', id: 'a' })
    actor.send({ type: 'TODO_PATCH', id: '1', patch: { text: 'ok' } })
    actor.send({ type: 'FLUSH_ACTIVE' })
    await flushMicrotasks()

    expect(activeEntry(actor).status).toBe('error')
    expect(activeEntry(actor).draft[0].text).toBe('ok')

    actor.send({ type: 'RETRY_SAVE' })
    await flushMicrotasks()

    expect(saveTodoList).toHaveBeenCalledTimes(2)
    expect(activeEntry(actor).status).toBe('clean')

    actor.stop()
  })

  it('reports unacked changes while dirty', async () => {
    const { actor } = await startCatalog()
    actor.send({ type: 'SELECT_LIST', id: 'a' })
    actor.send({ type: 'TODO_PATCH', id: '1', patch: { text: 'dirty' } })

    expect(hasUnackedChanges(actor.getSnapshot())).toBe(true)

    jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
    await flushMicrotasks()
    expect(hasUnackedChanges(actor.getSnapshot())).toBe(false)

    actor.stop()
  })
})

describe('todoListsMachine composer', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('materializes on first non-whitespace, hides linked row, and submits', async () => {
    const { actor } = await startCatalog({
      fetchTodoLists: jest.fn().mockResolvedValue({
        a: { id: 'a', title: 'A', todos: [] },
      }),
      saveTodoList: jest.fn().mockResolvedValue({ todos: [] }),
    })

    actor.send({ type: 'SELECT_LIST', id: 'a' })
    actor.send({ type: 'COMPOSER_CHANGE', text: '   ' })
    expect(activeEntry(actor).draft).toHaveLength(0)
    expect(activeEntry(actor).composer.text).toBe('   ')

    actor.send({ type: 'COMPOSER_CHANGE', text: 'B' })
    actor.send({ type: 'COMPOSER_CHANGE', text: 'Buy milk' })
    const entry = activeEntry(actor)
    expect(entry.draft).toHaveLength(1)
    expect(entry.draft[0].text).toBe('Buy milk')
    expect(entry.composer).toEqual({
      text: 'Buy milk',
      linkedId: entry.draft[0].id,
    })
    expect(selectVisibleTodos(entry)).toHaveLength(0)
    expect(entry.status).toBe('dirty')

    actor.send({ type: 'COMPOSER_SUBMIT' })
    expect(activeEntry(actor).composer.linkedId).toBeNull()
    expect(selectVisibleTodos(activeEntry(actor))).toHaveLength(1)

    actor.stop()
  })

  it('dematerializes when the linked composer is cleared', async () => {
    const { actor } = await startCatalog({
      saveTodoList: jest.fn().mockResolvedValue({ todos: [] }),
    })

    actor.send({ type: 'SELECT_LIST', id: 'a' })
    actor.send({ type: 'COMPOSER_CHANGE', text: 'Temp' })
    expect(activeEntry(actor).draft).toHaveLength(2)

    actor.send({ type: 'COMPOSER_CHANGE', text: '' })
    expect(activeEntry(actor).draft).toHaveLength(1)
    expect(activeEntry(actor).draft[0].id).toBe('1')
    expect(activeEntry(actor).composer.linkedId).toBeNull()

    actor.stop()
  })

  it('keeps emptied existing todos (clear-then-type) including completed/dueDate', async () => {
    const { actor } = await startCatalog({
      fetchTodoLists: jest.fn().mockResolvedValue({
        a: {
          id: 'a',
          title: 'A',
          todos: [
            createTodo({ id: 't1', text: 'Done', completed: true }),
            createTodo({ id: 't2', text: 'Dated', dueDate: '2099-01-01' }),
            createTodo({ id: 't3', text: 'Plain' }),
          ],
        },
      }),
      saveTodoList: jest.fn().mockResolvedValue({ todos: [] }),
    })

    actor.send({ type: 'SELECT_LIST', id: 'a' })
    actor.send({ type: 'TODO_PATCH', id: 't1', patch: { text: '' } })
    actor.send({ type: 'TODO_PATCH', id: 't2', patch: { text: '' } })
    actor.send({ type: 'TODO_PATCH', id: 't3', patch: { text: '' } })

    expect(activeEntry(actor).draft).toHaveLength(3)
    expect(activeEntry(actor).draft[2]).toEqual(
      expect.objectContaining({ id: 't3', text: '' })
    )

    actor.stop()
  })

  it('does not clobber a newer draft when an older save completes', async () => {
    let resolveSave
    const slowSave = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve
        })
    )
    const { actor } = await startCatalog({ saveTodoList: slowSave })

    actor.send({ type: 'SELECT_LIST', id: 'a' })
    actor.send({ type: 'TODO_PATCH', id: '1', patch: { text: 'v1' } })
    actor.send({ type: 'FLUSH_ACTIVE' })
    await flushMicrotasks()

    actor.send({ type: 'TODO_PATCH', id: '1', patch: { text: 'v2' } })

    resolveSave({
      id: 'a',
      title: 'A',
      todos: [createTodo({ id: '1', text: 'v1' })],
    })
    await flushMicrotasks()

    expect(activeEntry(actor).draft[0].text).toBe('v2')
    expect(activeEntry(actor).status).toBe('saving')

    actor.stop()
  })
})
