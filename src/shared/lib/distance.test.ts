import { describe, expect, it } from 'vitest'

import { formatDistance } from './distance'

describe('formatDistance', () => {
  it('shows metres below a kilometre and kilometres with one decimal above', () => {
    expect(formatDistance(850, 'hr-HR')).toBe('850 m')
    expect(formatDistance(12_340, 'hr-HR')).toBe('12,3 km')
    expect(formatDistance(2000, 'hr-HR')).toBe('2 km')
    expect(formatDistance(0, 'hr-HR')).toBe('0 m')
  })

  it('follows the locale', () => {
    expect(formatDistance(12_340, 'en-GB')).toBe('12.3 km')
  })
})
