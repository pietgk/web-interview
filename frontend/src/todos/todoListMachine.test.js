import { createActor } from 'xstate'
import {
  AUTOSAVE_DEBOUNCE_MS,
  createTodoListMachine,
  selectVisibleTodos,
} from './todoListMachine'
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

const startList = (saveTodoList, todos = [createTodo({ id: 't1', text: 'Original' })]) => {
  const machine = createTodoListMachine({ saveTodoList })
  const actor = createActor(machine, {
    input: { id: 'list-1', title: 'First', todos },
  })
  actor.start()
  return actor
}

describe('todoListMachine', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('debounces saves and coalesces rapid edits', async () => {
    const saveTodoList = jest.fn().mockResolvedValue({
      id: 'list-1',
      title: 'First',
      todos: [],
    })
    const actor = startList(saveTodoList)

    actor.send({ type: 'TODO_PATCH', id: 't1', patch: { text: 'a' } })
    actor.send({ type: 'TODO_PATCH', id: 't1', patch: { text: 'ab' } })
    actor.send({ type: 'TODO_PATCH', id: 't1', patch: { text: 'abc' } })

    expect(saveTodoList).not.toHaveBeenCalled()
    expect(actor.getSnapshot().value).toBe('dirty')

    jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
    await flushMicrotasks()

    expect(saveTodoList).toHaveBeenCalledTimes(1)
    expect(saveTodoList).toHaveBeenCalledWith('list-1', {
      todos: [expect.objectContaining({ text: 'abc' })],
    })
    expect(actor.getSnapshot().value).toBe('clean')

    actor.stop()
  })

  it('serializes overlapping saves and keeps the newest draft', async () => {
    const first = deferred()
    const second = deferred()
    const saveTodoList = jest
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const actor = startList(saveTodoList)

    actor.send({ type: 'TODO_PATCH', id: 't1', patch: { text: 'old' } })
    actor.send({ type: 'FLUSH' })
    await flushMicrotasks()
    expect(saveTodoList).toHaveBeenCalledTimes(1)

    actor.send({ type: 'TODO_PATCH', id: 't1', patch: { text: 'new' } })
    expect(saveTodoList).toHaveBeenCalledTimes(1)

    first.resolve({
      id: 'list-1',
      title: 'First',
      todos: [createTodo({ id: 't1', text: 'old' })],
    })
    await flushMicrotasks()

    expect(saveTodoList).toHaveBeenCalledTimes(2)
    expect(saveTodoList).toHaveBeenLastCalledWith('list-1', {
      todos: [expect.objectContaining({ text: 'new' })],
    })

    second.resolve({
      id: 'list-1',
      title: 'First',
      todos: [createTodo({ id: 't1', text: 'new' })],
    })
    await flushMicrotasks()

    expect(actor.getSnapshot().context.draft[0].text).toBe('new')
    expect(actor.getSnapshot().value).toBe('clean')

    actor.stop()
  })

  it('retries immediately after a failure', async () => {
    const saveTodoList = jest
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        id: 'list-1',
        title: 'First',
        todos: [createTodo({ id: 't1', text: 'ok' })],
      })

    const actor = startList(saveTodoList)
    actor.send({ type: 'TODO_PATCH', id: 't1', patch: { text: 'ok' } })
    actor.send({ type: 'FLUSH' })
    await flushMicrotasks()

    expect(actor.getSnapshot().value).toBe('error')
    expect(actor.getSnapshot().context.draft[0].text).toBe('ok')

    actor.send({ type: 'RETRY' })
    await flushMicrotasks()

    expect(saveTodoList).toHaveBeenCalledTimes(2)
    expect(actor.getSnapshot().value).toBe('clean')

    actor.stop()
  })

  it('materializes the composer on first non-whitespace character', () => {
    const saveTodoList = jest.fn().mockResolvedValue({ todos: [] })
    const actor = startList(saveTodoList, [])

    actor.send({ type: 'COMPOSER_CHANGE', text: '   ' })
    expect(actor.getSnapshot().context.draft).toHaveLength(0)
    expect(actor.getSnapshot().context.composer.text).toBe('   ')

    actor.send({ type: 'COMPOSER_CHANGE', text: 'B' })
    actor.send({ type: 'COMPOSER_CHANGE', text: 'Buy milk' })
    const snap = actor.getSnapshot()
    expect(snap.context.draft).toHaveLength(1)
    expect(snap.context.draft[0].text).toBe('Buy milk')
    expect(snap.context.composer).toEqual({
      text: 'Buy milk',
      linkedId: snap.context.draft[0].id,
    })
    expect(selectVisibleTodos(snap.context)).toHaveLength(0)
    expect(snap.value).toBe('dirty')

    actor.send({ type: 'COMPOSER_COMMIT' })
    expect(actor.getSnapshot().context.composer.linkedId).toBeNull()
    expect(selectVisibleTodos(actor.getSnapshot().context)).toHaveLength(1)

    actor.stop()
  })

  it('dematerializes when the linked composer is cleared', () => {
    const saveTodoList = jest.fn().mockResolvedValue({ todos: [] })
    const actor = startList(saveTodoList, [
      createTodo({ id: 't1', text: 'Keep me' }),
    ])

    actor.send({ type: 'COMPOSER_CHANGE', text: 'Temp' })
    expect(actor.getSnapshot().context.draft).toHaveLength(2)

    actor.send({ type: 'COMPOSER_CHANGE', text: '' })
    expect(actor.getSnapshot().context.draft).toHaveLength(1)
    expect(actor.getSnapshot().context.draft[0].id).toBe('t1')
    expect(actor.getSnapshot().context.composer.linkedId).toBeNull()

    actor.stop()
  })

  it('keeps emptied existing todos (clear-then-type) including completed/dueDate', () => {
    const saveTodoList = jest.fn().mockResolvedValue({ todos: [] })
    const actor = startList(saveTodoList, [
      createTodo({ id: 't1', text: 'Done', completed: true }),
      createTodo({ id: 't2', text: 'Dated', dueDate: '2099-01-01' }),
      createTodo({ id: 't3', text: 'Plain' }),
    ])

    actor.send({ type: 'TODO_PATCH', id: 't1', patch: { text: '' } })
    actor.send({ type: 'TODO_PATCH', id: 't2', patch: { text: '' } })
    actor.send({ type: 'TODO_PATCH', id: 't3', patch: { text: '' } })

    expect(actor.getSnapshot().context.draft).toHaveLength(3)
    expect(actor.getSnapshot().context.draft[2]).toEqual(
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
    const actor = startList(slowSave)

    actor.send({ type: 'TODO_PATCH', id: 't1', patch: { text: 'v1' } })
    actor.send({ type: 'FLUSH' })
    await flushMicrotasks()

    actor.send({ type: 'TODO_PATCH', id: 't1', patch: { text: 'v2' } })

    resolveSave({
      id: 'list-1',
      title: 'First',
      todos: [createTodo({ id: 't1', text: 'v1' })],
    })
    await flushMicrotasks()

    expect(actor.getSnapshot().context.draft[0].text).toBe('v2')
    expect(actor.getSnapshot().value).toBe('saving')

    actor.stop()
  })
})
