const REPLICA_DATABASE_NAMES = Object.freeze([
  'web-interview-todos',
  'web-interview-todos-v1',
])
const CLIENT_ID_STORAGE_KEY = 'web-interview-todo-client-id'

/**
 * The client persists nothing now, and datoms carry no origin. Existing users
 * would otherwise keep an orphaned replica and client id forever.
 */
export const deleteLegacyReplica = () => {
  try {
    for (const name of REPLICA_DATABASE_NAMES) {
      globalThis.indexedDB?.deleteDatabase(name)
    }
    globalThis.localStorage?.removeItem(CLIENT_ID_STORAGE_KEY)
  } catch {
    // A browser that blocks storage has nothing to clean up.
  }
}
