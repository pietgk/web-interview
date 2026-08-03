import { ATTRIBUTE, datomSchema } from '@web-interview/todos/datom'
import { DatomStore } from '@web-interview/todos/datom-store'
import { CONNECTION } from '@web-interview/todos/protocol'
import { selectListSummary, selectStatusBar } from '@web-interview/todos/selectors'
import { createUlidMinter, listId, todoId } from '@web-interview/todos/ulid'
import type { Datom, TodoClientStatus } from '@web-interview/todos/types'

const mint = createUlidMinter(() => 1_760_000_000_000)
const list = listId(1_760_000_000_000)
const todo = todoId(list, 1_760_000_000_001)

const parsed = datomSchema.safeParse([list, ATTRIBUTE.TITLE, 'Typed', mint.tx(), true])
if (!parsed.success) throw new Error(parsed.error.message)

const store = new DatomStore()
store.apply(parsed.data)
store.apply([todo, ATTRIBUTE.TEXT, 'Typed todo', mint.tx(), true] satisfies Datom)

const projected = store.readModel()
selectListSummary(projected[list])
void store.datomsSince(mint.tx())

declare const status: TodoClientStatus
selectStatusBar(status)

void CONNECTION.LIVE
