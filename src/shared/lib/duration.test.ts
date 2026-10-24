import { describe, expect, it } from 'vitest'

import { formatDuration } from './duration'

describe('formatDuration', () => {
  it('shows minutes, hours, or both (hr-HR)', () => {
    expect(formatDuration(45, 'hr-HR')).toBe('45 min')
    expect(formatDuration(60, 'hr-HR')).toBe('1 h')
    expect(formatDuration(90, 'hr-HR')).toBe('1 h 30 min')
    expect(formatDuration(125, 'hr-HR')).toBe('2 h 5 min')
    expect(formatDuration(0, 'hr-HR')).toBe('0 min')
  })

  it('uses the tenant locale', () => {
    expect(formatDuration(90, 'en-US')).toBe('1 hr 30 min')
  })
})
