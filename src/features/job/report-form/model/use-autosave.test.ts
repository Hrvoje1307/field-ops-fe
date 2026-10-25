import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAutosave } from './use-autosave'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

function setup(save: (value: string) => Promise<unknown>, options = {}) {
  return renderHook(({ value }) => useAutosave(value, 'start', save, options), {
    initialProps: { value: 'start' },
  })
}

describe('useAutosave', () => {
  it('saves nothing while the value is what the server has', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    setup(save)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(save).not.toHaveBeenCalled()
  })

  it('saves a change once it has been quiet, and only the last of several', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { result, rerender } = setup(save, { delay: 500 })
    rerender({ value: 'a' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    rerender({ value: 'ab' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(save).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(save).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledWith('ab')
    expect(result.current.status).toBe('saved')
  })

  it('a failed save keeps the input and is tried again, then says saved', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    const { result, rerender } = setup(save, { delay: 100, retryDelay: 1000 })
    rerender({ value: 'text' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
    })
    expect(result.current.status).toBe('failed')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith('text')
    expect(result.current.status).toBe('saved')
  })

  it('a change made while saving is saved right after', async () => {
    let finish: () => void = () => undefined
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve
          }),
      )
      .mockResolvedValue(undefined)
    const { rerender } = setup(save, { delay: 100 })
    rerender({ value: 'one' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
    })
    rerender({ value: 'two' })
    await act(async () => {
      finish()
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(save.mock.calls.map((call: unknown[]) => call[0])).toEqual(['one', 'two'])
  })

  it('flush saves at once and resolves when the latest value is on the server', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { result, rerender } = setup(save, { delay: 10_000 })
    rerender({ value: 'now' })
    await act(async () => {
      await result.current.flush()
    })
    expect(save).toHaveBeenCalledWith('now')
  })

  it('flush throws when the save fails, so the caller can stop', async () => {
    const save = vi.fn().mockRejectedValue(new Error('offline'))
    const { result, rerender } = setup(save, { delay: 10_000, retryDelay: 60_000 })
    rerender({ value: 'now' })
    let error: unknown
    await act(async () => {
      await result.current.flush().catch((caught: unknown) => (error = caught))
    })
    expect(error).toBeInstanceOf(Error)
    expect(result.current.status).toBe('failed')
  })

  it('leaving the screen saves what is waiting', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { rerender, unmount } = setup(save, { delay: 10_000 })
    rerender({ value: 'unsaved' })
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(save).toHaveBeenCalledWith('unsaved')
  })
})
