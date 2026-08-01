/** Debounce window for autosave network writes (milliseconds). */
export const AUTOSAVE_DEBOUNCE_MS = 400

/**
 * Per-list serialized, coalescing save queue.
 *
 * - At most one in-flight request per list
 * - Edits while saving coalesce into the newest pending draft
 * - Debounce controls network frequency; flush() forces an immediate save
 * - Stale completions are ignored via local revision comparison in onSuccess
 */
export const createSaveQueue = ({
  save,
  debounceMs = AUTOSAVE_DEBOUNCE_MS,
  onSaving,
  onSuccess,
  onError,
}) => {
  const lists = new Map()

  const getList = (id) => {
    if (!lists.has(id)) {
      lists.set(id, {
        timer: null,
        inFlight: false,
        pending: null,
      })
    }
    return lists.get(id)
  }

  const clearTimer = (list) => {
    if (list.timer != null) {
      clearTimeout(list.timer)
      list.timer = null
    }
  }

  const run = async (id) => {
    const list = getList(id)
    if (list.inFlight) return

    const job = list.pending
    if (!job) return

    list.pending = null
    list.inFlight = true
    onSaving?.(id, job)

    try {
      const result = await save(id, job.todos)
      onSuccess?.(id, { ...job, result })
    } catch (error) {
      onError?.(id, { ...job, error })
    } finally {
      list.inFlight = false
      if (list.pending) {
        clearTimer(list)
        run(id)
      }
    }
  }

  const enqueue = (id, todos, revision, { immediate = false } = {}) => {
    const list = getList(id)
    list.pending = { todos, revision }
    clearTimer(list)

    if (immediate) {
      run(id)
      return
    }

    list.timer = setTimeout(() => {
      list.timer = null
      run(id)
    }, debounceMs)
  }

  const flush = (id) => {
    const list = getList(id)
    clearTimer(list)
    if (list.pending || list.inFlight) {
      run(id)
    }
  }

  const flushAll = () => {
    for (const id of lists.keys()) {
      flush(id)
    }
  }

  const retry = (id, todos, revision) => {
    enqueue(id, todos, revision, { immediate: true })
  }

  const dispose = () => {
    for (const list of lists.values()) {
      clearTimer(list)
    }
    lists.clear()
  }

  return { enqueue, flush, flushAll, retry, dispose }
}
