import { ATTRIBUTE } from '@web-interview/todos/datom'
import type { TodoLists } from '@web-interview/todos/types'
import { createTodoListCommands } from './todoListCommands.ts'

const UPDATED_DUE_DAY = '2026-08-09'
const EXISTING_TODO = {
  id: 'L1/T1',
  text: 'Milk',
  completed: false,
  dueDate: null,
}

const existingReadModel = () => ({
  L1: { id: 'L1', title: 'Groceries', todos: [{ ...EXISTING_TODO }] },
})

/**
 * Records what reached the client, so a test asserts the datom a command wrote
 * rather than that some method was called.
 */
const fakeClient = ({
  assertReturns = ['a', 'b', 'c', 'tx', true],
  readModel = existingReadModel(),
}: {
  assertReturns?: unknown
  readModel?: TodoLists
} = {}) => {
  const writes: Array<[string, string, string, unknown]> = []
  let minted = 0
  let currentReadModel = readModel
  return {
    writes,
    getReadModel: () => currentReadModel,
    replaceReadModel: (nextReadModel: TodoLists) => {
      currentReadModel = nextReadModel
    },
    newListId: () => 'L-new',
    newTodoId: (listEntity: string) => `${listEntity}/T-${++minted}`,
    assert: (e: string, a: string, v: unknown) => {
      writes.push(['assert', e, a, v])
      return assertReturns
    },
    retract: (e: string, a: string, v: unknown) => {
      writes.push(['retract', e, a, v])
      return assertReturns
    },
  }
}

const commandsFor = (client: ReturnType<typeof fakeClient>) =>
  createTodoListCommands(client as never)

describe('Todo List commands', () => {
  it('reserves a Todo List id without writing anything', () => {
    const client = fakeClient()
    expect(commandsFor(client).reserveListId()).toBe('L-new')
    expect(client.writes).toEqual([])
  })

  it('materializes a reserved Todo List by asserting its defining attribute', () => {
    const client = fakeClient()
    const commands = commandsFor(client)
    const reservedListId = commands.reserveListId()
    commands.materializeList(reservedListId, 'Errands')
    expect(client.writes).toEqual([['assert', 'L-new', ATTRIBUTE.TITLE, 'Errands']])
  })

  it('renames a Todo List that still exists', () => {
    const client = fakeClient()
    commandsFor(client).renameList('L1', 'Weekly groceries')
    expect(client.writes).toEqual([
      ['assert', 'L1', ATTRIBUTE.TITLE, 'Weekly groceries'],
    ])
  })

  it('ignores a stale Todo List rename after observing its deletion', () => {
    const client = fakeClient()
    const commands = commandsFor(client)
    client.replaceReadModel({})

    commands.renameList('L1', 'Stale title')

    expect(client.writes).toEqual([])
  })

  it('deletes a Todo List with one retraction carrying the title it believed was there', () => {
    const client = fakeClient()
    commandsFor(client).deleteList({ id: 'L1', title: 'Groceries', todos: [] })
    expect(client.writes).toEqual([['retract', 'L1', ATTRIBUTE.TITLE, 'Groceries']])
  })

  it('mints a Todo id under its Todo List and returns it', () => {
    const client = fakeClient()
    expect(commandsFor(client).addTodo('L1', 'Milk')).toBe('L1/T-1')
    expect(client.writes).toEqual([['assert', 'L1/T-1', ATTRIBUTE.TEXT, 'Milk']])
  })

  it('returns no Todo id while editing is disabled, so nothing links to a Todo that was not written', () => {
    const client = fakeClient({ assertReturns: null })
    expect(commandsFor(client).addTodo('L1', 'Milk')).toBe(null)
  })

  it('retitles and completes a Todo', () => {
    const client = fakeClient()
    const commands = commandsFor(client)
    commands.retitleTodo(EXISTING_TODO, 'Oat milk')
    commands.setTodoCompleted(EXISTING_TODO, true)
    expect(client.writes).toEqual([
      ['assert', 'L1/T1', ATTRIBUTE.TEXT, 'Oat milk'],
      ['assert', 'L1/T1', ATTRIBUTE.COMPLETED, true],
    ])
  })

  it('ignores a stale Todo retitle after observing its deletion', () => {
    const client = fakeClient()
    const commands = commandsFor(client)
    client.replaceReadModel({
      L1: { id: 'L1', title: 'Groceries', todos: [] },
    })

    commands.retitleTodo(EXISTING_TODO, 'Stale text')

    expect(client.writes).toEqual([])
  })

  it('asserts a due date, and retracts the one that was there when it is cleared', () => {
    const client = fakeClient()
    const commands = commandsFor(client)
    const undated = { id: 'L1/T1', text: 'Milk', completed: false, dueDate: null }
    commands.setTodoDueDate(undated, UPDATED_DUE_DAY)
    commands.setTodoDueDate({ ...undated, dueDate: UPDATED_DUE_DAY }, null)
    expect(client.writes).toEqual([
      ['assert', 'L1/T1', ATTRIBUTE.DUE_DATE, UPDATED_DUE_DAY],
      ['retract', 'L1/T1', ATTRIBUTE.DUE_DATE, UPDATED_DUE_DAY],
    ])
  })

  it('writes nothing when clearing a due date a Todo never had', () => {
    const client = fakeClient()
    commandsFor(client).setTodoDueDate(
      { id: 'L1/T1', text: 'Milk', completed: false, dueDate: null },
      null
    )
    expect(client.writes).toEqual([])
  })

  it('deletes a Todo by retracting the text that defines it', () => {
    const client = fakeClient()
    commandsFor(client).deleteTodo({
      id: 'L1/T1',
      text: 'Milk',
      completed: false,
      dueDate: null,
    })
    expect(client.writes).toEqual([['retract', 'L1/T1', ATTRIBUTE.TEXT, 'Milk']])
  })
})
