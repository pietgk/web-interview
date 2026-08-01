import { createActor, SimulatedClock, waitFor } from 'xstate'
import {
  AUTOSAVE_DEBOUNCE_MS,
  createTodoListMachine,
  selectTodoListView,
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

const seed = {
  id: 'a',
  title: 'A',
  todos: [createTodo({ id: '1', text: 'Original' })],
}

const startList = ({ saveTodoList = jest.fn(async (id, { todos }) => ({ id, todos })) } = {}) => {
  const clock = new SimulatedClock()
  const actor = createActor(createTodoListMachine({ saveTodoList }), {
    input: seed,
    clock,
  })
  actor.start()
  return { actor, clock, saveTodoList }
}

describe('todoListMachine', () => {
  it('debounces edits using actor time and coalesces the latest draft', async () => {
    const { actor, clock, saveTodoList } = startList()

    actor.send({ type: 'TODO_PATCH', id: '1', patch: { text: 'a' } })
    clock.increment(AUTOSAVE_DEBOUNCE_MS - 1)
    actor.send({ type: 'TODO_PATCH', id: '1', patch: { text: 'latest' } })
    clock.increment(AUTOSAVE_DEBOUNCE_MS - 1)

    expect(actor.getSnapshot().matches('dirty')).toBe(true)
    expect(saveTodoList).not.toHaveBeenCalled()

    clock.increment(1)
    await waitFor(actor, (snapshot) => snapshot.matches('clean'))

    expect(saveTodoList).toHaveBeenCalledTimes(1)
    expect(saveTodoList).toHaveBeenCalledWith('a', {
      todos: [expect.objectContaining({ text: 'latest' })],
    })
    actor.stop()
  })

  it('serializes one list while immediately persisting a newer in-flight edit', async () => {
    const first = deferred()
    const second = deferred()
    const saveTodoList = jest
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const { actor } = startList({ saveTodoList })

    actor.send({ type: 'TODO_PATCH', id: '1', patch: { text: 'first' } })
    actor.send({ type: 'FLUSH' })
    expect(actor.getSnapshot().matches('saving')).toBe(true)
    expect(saveTodoList).toHaveBeenCalledTimes(1)

    actor.send({ type: 'TODO_PATCH', id: '1', patch: { text: 'second' } })
    first.resolve({ id: 'a', todos: [createTodo({ id: '1', text: 'first' })] })

    await waitFor(actor, () => saveTodoList.mock.calls.length === 2)
    expect(saveTodoList).toHaveBeenLastCalledWith('a', {
      todos: [expect.objectContaining({ text: 'second' })],
    })

    second.resolve({ id: 'a', todos: [createTodo({ id: '1', text: 'second' })] })
    await waitFor(actor, (snapshot) => snapshot.matches('clean'))

    expect(selectTodoListView(actor.getSnapshot()).draft[0].text).toBe('second')
    actor.stop()
  })

  it('retains a failed draft and retries the latest revision', async () => {
    const saveTodoList = jest
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockImplementationOnce(async (id, { todos }) => ({ id, todos }))
    const { actor } = startList({ saveTodoList })

    actor.send({ type: 'TODO_PATCH', id: '1', patch: { text: 'Retry me' } })
    actor.send({ type: 'FLUSH' })
    await waitFor(actor, (snapshot) => snapshot.matches('error'))

    expect(selectTodoListView(actor.getSnapshot())).toEqual(
      expect.objectContaining({
        draft: [expect.objectContaining({ text: 'Retry me' })],
        status: 'error',
        error: 'network down',
      })
    )

    actor.send({ type: 'RETRY' })
    await waitFor(actor, (snapshot) => snapshot.matches('clean'))

    expect(saveTodoList).toHaveBeenCalledTimes(2)
    actor.stop()
  })

  it('retries the newest draft when an older in-flight revision fails', async () => {
    const first = deferred()
    const saveTodoList = jest
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(async (id, { todos }) => ({ id, todos }))
    const { actor } = startList({ saveTodoList })

    actor.send({ type: 'TODO_PATCH', id: '1', patch: { text: 'first' } })
    actor.send({ type: 'FLUSH' })
    actor.send({ type: 'TODO_PATCH', id: '1', patch: { text: 'newest' } })
    first.reject(new Error('network down'))
    await waitFor(actor, (snapshot) => snapshot.matches('error'))

    actor.send({ type: 'RETRY' })
    await waitFor(actor, (snapshot) => snapshot.matches('clean'))

    expect(saveTodoList).toHaveBeenLastCalledWith('a', {
      todos: [expect.objectContaining({ text: 'newest' })],
    })
    actor.stop()
  })

  it('keeps composer materialization inside the owning list actor', () => {
    const { actor } = startList()

    actor.send({ type: 'COMPOSER_CHANGE', text: 'New todo' })
    let view = selectTodoListView(actor.getSnapshot())
    expect(actor.getSnapshot().matches('dirty')).toBe(true)
    expect(view.composerText).toBe('New todo')
    expect(view.draft).toHaveLength(1)

    actor.send({ type: 'COMPOSER_SUBMIT' })
    view = selectTodoListView(actor.getSnapshot())
    expect(view.composerText).toBe('')
    expect(view.draft).toHaveLength(2)

    actor.stop()
  })

  it('ignores stale todo events without creating unsaved work', () => {
    const { actor, saveTodoList } = startList()

    actor.send({ type: 'TODO_PATCH', id: 'missing', patch: { text: 'Nope' } })
    actor.send({ type: 'TODO_REMOVE', id: 'missing' })

    expect(actor.getSnapshot().matches('clean')).toBe(true)
    expect(actor.getSnapshot().context.revision).toBe(0)
    expect(saveTodoList).not.toHaveBeenCalled()
    actor.stop()
  })
})
