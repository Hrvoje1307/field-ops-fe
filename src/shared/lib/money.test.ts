import { describe, expect, it } from 'vitest'

import { formatMoney } from './money'

describe('formatMoney', () => {
  it('formats in the tenant locale and currency', () => {
    expect(formatMoney('12.50', { locale: 'hr-HR', currency: 'EUR' })).toBe('12,50 €')
    expect(formatMoney('1234.5', { locale: 'en-US', currency: 'USD' })).toBe('$1,234.50')
  })

  it('never goes through a float (exact beyond 2^53)', () => {
    expect(formatMoney('9007199254740993.10', { locale: 'en-US', currency: 'USD' })).toBe(
      '$9,007,199,254,740,993.10',
    )
  })

  it('rejects anything that is not a decimal string', () => {
    expect(() => formatMoney('12,50', { locale: 'hr-HR', currency: 'EUR' })).toThrow(RangeError)
  })
})
