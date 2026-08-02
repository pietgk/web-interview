import { createActor, SimulatedClock, waitFor } from 'xstate'
import { selectListSummary } from './todoListMachine'
import {
  createTodoListsMachine,
  hasUnackedChanges,
  selectCatalogView,
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
  fetchTodoLists = vi.fn().mockResolvedValue(seedLists),
  saveTodoList = vi.fn(async (id, { todos }) => ({ id, todos })),
} = {}) => {
  const clock = new SimulatedClock()
  const actor = createActor(createTodoListsMachine({ fetchTodoLists, saveTodoList }), {
    clock,
  })
  actor.start()
  await waitFor(actor, (snapshot) => snapshot.matches('ready'))
  return { actor, clock, fetchTodoLists, saveTodoList }
}

const listRef = (actor, id) => actor.getSnapshot().context.listRefs[id]

describe('todoListsMachine', () => {
  it('loads the catalog and spawns one independently inspectable actor per list', async () => {
    const { actor } = await startCatalog()
    const view = selectCatalogView(actor.getSnapshot())

    expect(view.loadState).toBe('ready')
    expect(view.lists.map((list) => list.id)).toEqual(['a', 'b'])
    expect(selectListSummary(view.lists[0].actorRef.getSnapshot())).toEqual(
      expect.objectContaining({ id: 'a', title: 'A', status: 'clean' })
    )

    actor.stop()
  })

  it('flushes the owning list actor when selection changes', async () => {
    const { actor, saveTodoList } = await startCatalog()

    actor.send({ type: 'SELECT_LIST', id: 'a' })
    listRef(actor, 'a').send({
      type: 'TODO_PATCH',
      id: '1',
      patch: { text: 'Edited A' },
    })
    actor.send({ type: 'SELECT_LIST', id: 'b' })

    await waitFor(listRef(actor, 'a'), (snapshot) => snapshot.matches('clean'))
    expect(saveTodoList).toHaveBeenCalledWith('a', {
      todos: [expect.objectContaining({ text: 'Edited A' })],
    })
    expect(actor.getSnapshot().context.activeListId).toBe('b')

    actor.stop()
  })

  it('allows unrelated lists to save concurrently', async () => {
    const saves = { a: deferred(), b: deferred() }
    const saveTodoList = vi.fn((id) => saves[id].promise)
    const { actor } = await startCatalog({ saveTodoList })

    listRef(actor, 'a').send({
      type: 'TODO_PATCH',
      id: '1',
      patch: { text: 'A changed' },
    })
    listRef(actor, 'b').send({
      type: 'TODO_PATCH',
      id: '2',
      patch: { text: 'B changed' },
    })
    actor.send({ type: 'FLUSH_ALL' })

    expect(listRef(actor, 'a').getSnapshot().matches('saving')).toBe(true)
    expect(listRef(actor, 'b').getSnapshot().matches('saving')).toBe(true)
    expect(saveTodoList).toHaveBeenCalledTimes(2)

    saves.a.resolve({ id: 'a', todos: [] })
    saves.b.resolve({ id: 'b', todos: [] })
    await Promise.all([
      waitFor(listRef(actor, 'a'), (snapshot) => snapshot.matches('clean')),
      waitFor(listRef(actor, 'b'), (snapshot) => snapshot.matches('clean')),
    ])

    actor.stop()
  })

  it('reports unacknowledged work across child actors', async () => {
    const { actor } = await startCatalog()
    const child = listRef(actor, 'a')

    child.send({ type: 'TODO_PATCH', id: '1', patch: { text: 'Dirty' } })
    expect(hasUnackedChanges(actor.getSnapshot())).toBe(true)

    child.send({ type: 'FLUSH' })
    await waitFor(child, (snapshot) => snapshot.matches('clean'))
    expect(hasUnackedChanges(actor.getSnapshot())).toBe(false)

    actor.stop()
  })

  it('ignores selection events for unknown lists', async () => {
    const { actor } = await startCatalog()

    actor.send({ type: 'SELECT_LIST', id: 'missing' })
    expect(actor.getSnapshot().context.activeListId).toBeNull()

    actor.stop()
  })

  it('stops old list actors before reloading a fresh catalog', async () => {
    const fetchTodoLists = vi
      .fn()
      .mockResolvedValueOnce(seedLists)
      .mockResolvedValueOnce({
        c: { id: 'c', title: 'C', todos: [] },
      })
    const { actor } = await startCatalog({ fetchTodoLists })
    const oldRef = listRef(actor, 'a')

    actor.send({ type: 'RELOAD' })
    await waitFor(
      actor,
      (snapshot) => snapshot.matches('ready') && snapshot.context.listIds[0] === 'c'
    )

    expect(oldRef.getSnapshot().status).toBe('stopped')
    expect(actor.getSnapshot().context.listIds).toEqual(['c'])
    actor.stop()
  })

  it('surfaces loading errors and retries', async () => {
    const fetchTodoLists = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(seedLists)
    const actor = createActor(
      createTodoListsMachine({
        fetchTodoLists,
        saveTodoList: vi.fn(),
      })
    )
    actor.start()

    await waitFor(actor, (snapshot) => snapshot.matches('error'))
    expect(selectCatalogView(actor.getSnapshot())).toEqual(
      expect.objectContaining({ loadState: 'error', loadError: 'offline' })
    )

    actor.send({ type: 'RELOAD' })
    await waitFor(actor, (snapshot) => snapshot.matches('ready'))
    expect(fetchTodoLists).toHaveBeenCalledTimes(2)
    actor.stop()
  })
})
