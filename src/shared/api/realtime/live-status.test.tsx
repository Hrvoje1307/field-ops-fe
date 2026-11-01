import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { setHubLive, useHubLive } from './live-status'

afterEach(() => {
  setHubLive(false)
})

describe('useHubLive', () => {
  it('follows the hub: off until it is connected, off again when it is lost', () => {
    const { result } = renderHook(() => useHubLive())
    expect(result.current).toBe(false)
    act(() => {
      setHubLive(true)
    })
    expect(result.current).toBe(true)
    act(() => {
      setHubLive(false)
    })
    expect(result.current).toBe(false)
  })
})
