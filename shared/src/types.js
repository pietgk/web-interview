/** @typedef {'title' | 'text' | 'completed' | 'dueDate'} Attribute */

/** @typedef {'Todo List' | 'Todo'} EntityType */

/** @typedef {string | number | boolean} FactValue */

/** @typedef {[entity: string, attribute: Attribute, value: FactValue, tx: string, op: boolean]} Datom */

/** @typedef {{v: FactValue, tx: string, op: boolean}} Fact */

/**
 * @typedef {object} Todo
 * @property {string} id
 * @property {string} text
 * @property {boolean} completed
 * @property {string | null} dueDate
 */

/**
 * @typedef {object} TodoList
 * @property {string} id
 * @property {string} title
 * @property {Todo[]} todos
 */

/** @typedef {Record<string, TodoList>} TodoLists */

/** @typedef {'connecting' | 'live' | 'reconnecting' | 'failed'} Connection */

/**
 * What the client knows about its own delivery. `saving` is `pendingCount > 0`
 * held true only after the outbox has been non-empty long enough to be worth
 * showing.
 *
 * @typedef {object} TodoClientStatus
 * @property {Connection} connection
 * @property {number} pendingCount
 * @property {boolean} saving
 * @property {boolean} canEdit
 * @property {string | null} error
 * @property {string | null} epoch which log the store was folded from, null until the stream says
 */

/** @typedef {'error' | 'info' | 'success' | 'warning'} StatusBarSeverity */
/** @typedef {{id: string, text: string}} StatusBarPart */
/** @typedef {{label: string, event: 'RECONNECT'}} StatusBarAction */
/** @typedef {{reason: string}} StatusBarDetails */
/**
 * @typedef {object} StatusBarModel
 * @property {StatusBarSeverity} severity
 * @property {StatusBarPart[]} parts
 * @property {StatusBarAction | null} action
 * @property {StatusBarDetails | null} details
 */

export {}
