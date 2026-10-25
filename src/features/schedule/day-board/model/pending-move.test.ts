import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { usePendingMove } from './pending-move'

const saved = { queue: ['a', 'b'], t1: ['c'] }
const move = { itemId: 'a', fromId: 'queue', toId: 't1', index: 1 }

describe('usePendingMove', () => {
  it('shows the card where it was dropped, on the board it was dropped on', () => {
    const { result } = renderHook(({ stamp }) => usePendingMove(stamp), {
      initialProps: { stamp: 1 },
    })
    expect(result.current.apply(saved)).toBe(saved)
    act(() => {
      result.current.begin(move)
    })
    expect(result.current.apply(saved)).toEqual({ queue: ['b'], t1: ['c', 'a'] })
  })

  it('shows what the server says once newer data has arrived', () => {
    const { result, rerender } = renderHook(({ stamp }) => usePendingMove(stamp), {
      initialProps: { stamp: 1 },
    })
    act(() => {
      result.current.begin(move)
    })
    rerender({ stamp: 2 })
    expect(result.current.apply(saved)).toBe(saved)
    // and it does not come back when yet another fetch arrives
    rerender({ stamp: 3 })
    expect(result.current.apply(saved)).toBe(saved)
  })

  it('a move that failed is gone at once, and a later fetch does not bring it back', () => {
    const { result, rerender } = renderHook(({ stamp }) => usePendingMove(stamp), {
      initialProps: { stamp: 1 },
    })
    act(() => {
      result.current.begin(move)
    })
    act(() => {
      result.current.clear()
    })
    expect(result.current.apply(saved)).toBe(saved)
    rerender({ stamp: 1 })
    expect(result.current.apply(saved)).toBe(saved)
  })

  it('a new drop on newer data starts over', () => {
    const { result, rerender } = renderHook(({ stamp }) => usePendingMove(stamp), {
      initialProps: { stamp: 1 },
    })
    act(() => {
      result.current.begin(move)
    })
    rerender({ stamp: 2 })
    act(() => {
      result.current.begin({ itemId: 'b', fromId: 'queue', toId: 't1', index: 0 })
    })
    expect(result.current.apply(saved)).toEqual({ queue: ['a'], t1: ['b', 'c'] })
  })
})
