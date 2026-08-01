import { AUTOSAVE_DEBOUNCE_MS, createSaveQueue } from './createSaveQueue'

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

describe('createSaveQueue', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('debounces saves and coalesces rapid edits', async () => {
    const save = jest.fn().mockResolvedValue({ todos: [] })
    const onSuccess = jest.fn()
    const queue = createSaveQueue({
      save,
      debounceMs: AUTOSAVE_DEBOUNCE_MS,
      onSaving: jest.fn(),
      onSuccess,
      onError: jest.fn(),
    })

    queue.enqueue('list-1', [{ id: 't1', text: 'a' }], 1)
    queue.enqueue('list-1', [{ id: 't1', text: 'ab' }], 2)
    queue.enqueue('list-1', [{ id: 't1', text: 'abc' }], 3)

    expect(save).not.toHaveBeenCalled()

    jest.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
    await flushMicrotasks()

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('list-1', [{ id: 't1', text: 'abc' }])
    expect(onSuccess).toHaveBeenCalledWith(
      'list-1',
      expect.objectContaining({ revision: 3 })
    )

    queue.dispose()
  })

  it('serializes overlapping saves and keeps the newest draft', async () => {
    const first = deferred()
    const second = deferred()
    const save = jest
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const onSuccess = jest.fn()
    const queue = createSaveQueue({
      save,
      debounceMs: AUTOSAVE_DEBOUNCE_MS,
      onSaving: jest.fn(),
      onSuccess,
      onError: jest.fn(),
    })

    queue.enqueue('list-1', [{ id: 't1', text: 'old' }], 1, { immediate: true })
    expect(save).toHaveBeenCalledTimes(1)

    queue.enqueue('list-1', [{ id: 't1', text: 'new' }], 2, { immediate: true })
    expect(save).toHaveBeenCalledTimes(1)

    first.resolve({ todos: [{ id: 't1', text: 'old' }] })
    await flushMicrotasks()

    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith('list-1', [{ id: 't1', text: 'new' }])

    second.resolve({ todos: [{ id: 't1', text: 'new' }] })
    await flushMicrotasks()

    expect(onSuccess).toHaveBeenLastCalledWith(
      'list-1',
      expect.objectContaining({
        revision: 2,
        result: { todos: [{ id: 't1', text: 'new' }] },
      })
    )

    queue.dispose()
  })

  it('retries immediately after a failure', async () => {
    const save = jest
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ todos: [{ id: 't1', text: 'ok' }] })
    const onError = jest.fn()
    const onSuccess = jest.fn()
    const queue = createSaveQueue({
      save,
      debounceMs: AUTOSAVE_DEBOUNCE_MS,
      onSaving: jest.fn(),
      onSuccess,
      onError,
    })

    queue.enqueue('list-1', [{ id: 't1', text: 'ok' }], 1, { immediate: true })
    await flushMicrotasks()
    expect(onError).toHaveBeenCalled()

    queue.retry('list-1', [{ id: 't1', text: 'ok' }], 1)
    await flushMicrotasks()

    expect(save).toHaveBeenCalledTimes(2)
    expect(onSuccess).toHaveBeenCalled()

    queue.dispose()
  })
})
