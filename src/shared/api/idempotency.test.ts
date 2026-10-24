import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useIdempotencyKeys } from './idempotency'

describe('useIdempotencyKeys', () => {
  it('reuses the key for the same request until it is forgotten', () => {
    const { result, rerender } = renderHook(() => useIdempotencyKeys())
    const request = { id: 'job-1', body: { to: 'cancelled', note: 'x', version: 3 } }
    const first = result.current.keyFor(request)
    rerender()
    expect(result.current.keyFor({ ...request })).toBe(first)
    expect(result.current.keyFor({ ...request, body: { ...request.body, version: 4 } })).not.toBe(
      first,
    )
    result.current.forget(request)
    expect(result.current.keyFor(request)).not.toBe(first)
  })
})
