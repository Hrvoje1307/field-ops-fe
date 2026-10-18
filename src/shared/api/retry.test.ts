import { describe, expect, it } from 'vitest'

import { ApiError } from './api-error'
import { shouldRetry } from './retry'

describe('shouldRetry', () => {
  it.each([400, 401, 403, 404, 409, 410, 422, 429])('never retries a %i response', (status) => {
    expect(shouldRetry(0, new ApiError(status, undefined))).toBe(false)
  })

  it('retries a 5xx response up to 3 times', () => {
    const error = new ApiError(503, undefined)
    expect(shouldRetry(0, error)).toBe(true)
    expect(shouldRetry(2, error)).toBe(true)
    expect(shouldRetry(3, error)).toBe(false)
  })

  it('retries network errors up to 3 times', () => {
    const error = new TypeError('Failed to fetch')
    expect(shouldRetry(0, error)).toBe(true)
    expect(shouldRetry(3, error)).toBe(false)
  })
})
