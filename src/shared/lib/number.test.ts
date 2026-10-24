import { describe, expect, it } from 'vitest'

import { decimalSeparator, formatNumber, numberToInput, parseInputNumber } from './number'

describe('parseInputNumber', () => {
  it('accepts a decimal comma or point, and spaces', () => {
    expect(parseInputNumber('6,1')).toBe(6.1)
    expect(parseInputNumber('6.1')).toBe(6.1)
    expect(parseInputNumber(' 12 ')).toBe(12)
    expect(parseInputNumber('1 200')).toBe(1200)
    expect(parseInputNumber('-2,5')).toBe(-2.5)
    expect(parseInputNumber('0')).toBe(0)
  })

  it('rejects text, grouping and exponents', () => {
    expect(parseInputNumber('')).toBeNull()
    expect(parseInputNumber('abc')).toBeNull()
    expect(parseInputNumber('1.234,5')).toBeNull()
    expect(parseInputNumber('1,2,3')).toBeNull()
    expect(parseInputNumber('1e5')).toBeNull()
    expect(parseInputNumber('12 kW')).toBeNull()
  })
})

describe('locale number helpers', () => {
  it('formats in the locale', () => {
    expect(formatNumber(1234.5, 'hr-HR')).toBe('1.234,5')
    expect(formatNumber(1234.5, 'en-US')).toBe('1,234.5')
    expect(formatNumber(6.125, 'hr-HR')).toBe('6,125')
  })

  it('writes numbers for inputs with the locale decimal separator, without grouping', () => {
    expect(decimalSeparator('hr-HR')).toBe(',')
    expect(decimalSeparator('en-US')).toBe('.')
    expect(numberToInput(1234.5, 'hr-HR')).toBe('1234,5')
    expect(numberToInput(1234.5, 'en-US')).toBe('1234.5')
    expect(parseInputNumber(numberToInput(6.1, 'hr-HR'))).toBe(6.1)
  })
})
