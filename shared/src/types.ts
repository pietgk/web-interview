export type Attribute = 'title' | 'text' | 'completed' | 'dueDate'

export type EntityType = 'Todo List' | 'Todo'

export type FactValue = string | number | boolean

export type Datom = [entity: string, attribute: Attribute, value: FactValue, tx: string, op: boolean]

export type Fact = { v: FactValue, tx: string, op: boolean }

export type Todo = {
  id: string
  text: string
  completed: boolean
  dueDate: string | null
}

export type TodoList = {
  id: string
  title: string
  todos: Todo[]
}

export type TodoLists = Record<string, TodoList>

export type Connection = 'connecting' | 'live' | 'reconnecting' | 'failed'

export type ApiErrorCode = 'INTERNAL_ERROR' | 'INVALID_DATOM' | 'MALFORMED_JSON' | 'VALIDATION_ERROR'
export type BrowserErrorCode = 'INVALID_RESPONSE' | 'NETWORK_ERROR'
export type ApiErrorIssue = { path: Array<string | number>, message: string }
export type DeliveryFailure =
  | { kind: 'api', status: number, code: ApiErrorCode, message: string, issues: ApiErrorIssue[] }
  | { kind: 'invalid-response', status: number | null, code: BrowserErrorCode, message: string, issues: [] }
  | { kind: 'network', status: null, code: BrowserErrorCode, message: string, issues: [] }

/**
 * What the client knows about its own delivery. `saving` is `pendingCount > 0`
 * held true only after the outbox has been non-empty long enough to be worth
 * showing.
 */
export type TodoClientStatus = {
  connection: Connection
  pendingCount: number
  saving: boolean
  canEdit: boolean
  rehydrating: boolean
  failure: DeliveryFailure | null
  /** which log the store was folded from, null until the stream says */
  epoch: string | null
}

export type StatusBarSeverity = 'error' | 'info' | 'success' | 'warning'
export type StatusBarPart = { id: string, text: string }
export type StatusBarAction = { label: string, event: 'RECONNECT' }
export type StatusBarDetails = { status: number | null, code: string, message: string, issues: ApiErrorIssue[] }
export type StatusBarModel = {
  severity: StatusBarSeverity
  parts: StatusBarPart[]
  action: StatusBarAction | null
  details: StatusBarDetails | null
}
