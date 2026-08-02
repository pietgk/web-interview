import { createTodoListActor } from '@web-interview/todos/actor'
import { parseTodoList } from '@web-interview/todos/contract'
import {
  applyTransaction,
  databaseFromReadModel,
  projectTodoLists,
} from '@web-interview/todos/database'
import { ACTOR_EVENT, TRANSACTION_CAUSE, todoListPath } from '@web-interview/todos/protocol'
import { selectListSummary, selectTodoLists } from '@web-interview/todos/selectors'
import {
  createTodoTransaction,
  patchTodoTransaction,
} from '@web-interview/todos/transactions'
import type {
  TodoListSnapshot,
  TodoStorage,
  Transaction,
} from '@web-interview/todos/types'

const parsed = parseTodoList({
  id: 'list',
  title: 'List',
  todos: [{ id: 'todo', text: 'Typed', completed: false, dueDate: null }],
})

if (!parsed.ok) throw new Error(parsed.body.error)

const database = databaseFromReadModel({ [parsed.data.id]: parsed.data })
const transaction: Transaction = createTodoTransaction({
  basis: database.basis,
  clientId: 'type-test',
  listId: parsed.data.id,
  todo: parsed.data.todos[0],
})
const applied = applyTransaction(database, transaction)
const projected = projectTodoLists(applied.database)
selectListSummary(projected.list)
todoListPath(projected.list.id)

const patch = patchTodoTransaction({
  basis: applied.database.basis,
  clientId: 'type-test',
  listId: projected.list.id,
  todo: projected.list.todos[0],
  patch: { completed: true },
})
if (patch) applyTransaction(applied.database, patch)

const storage: TodoStorage = {
  async load() {
    return {
      hasReplica: true,
      basis: applied.database.basis,
      authoritativeReadModel: projected,
      pendingTransactions: [],
    }
  },
  async append(nextTransaction) {
    return { transaction: nextTransaction, authoritative: true }
  },
}

const actor = createTodoListActor({ storage })
actor.send({ type: ACTOR_EVENT.TRANSACT, transaction })

declare const snapshot: TodoListSnapshot
selectTodoLists(snapshot)

void TRANSACTION_CAUSE.TODO_CREATED
