import { describe, expect, it } from 'vitest'

import { isValidPeriod, matchPreset, periodFromSearch, presetPeriod } from './period'

describe('presetPeriod', () => {
  it('this month runs from the first to today', () => {
    expect(presetPeriod('thisMonth', '2026-11-18')).toEqual({
      from: '2026-11-01',
      to: '2026-11-18',
    })
  })
  it('last month is the whole month, across a year boundary and in a leap year', () => {
    expect(presetPeriod('lastMonth', '2026-11-18')).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    })
    expect(presetPeriod('lastMonth', '2027-01-05')).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    })
    expect(presetPeriod('lastMonth', '2028-03-01')).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    })
  })
  it('the last 90 days include today', () => {
    expect(presetPeriod('last90', '2026-11-01')).toEqual({ from: '2026-08-04', to: '2026-11-01' })
  })
})

describe('periods from the address', () => {
  it('falls back to this month for a missing, broken or reversed range', () => {
    const month = { from: '2026-11-01', to: '2026-11-18' }
    expect(periodFromSearch({}, '2026-11-18')).toEqual(month)
    expect(periodFromSearch({ from: 'x', to: '2026-11-02' }, '2026-11-18')).toEqual(month)
    expect(periodFromSearch({ from: '2026-11-09', to: '2026-11-02' }, '2026-11-18')).toEqual(month)
    expect(periodFromSearch({ from: '2026-09-01', to: '2026-09-30' }, '2026-11-18')).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    })
  })
  it('knows which preset a period is', () => {
    expect(matchPreset({ from: '2026-10-01', to: '2026-10-31' }, '2026-11-18')).toBe('lastMonth')
    expect(matchPreset({ from: '2026-10-02', to: '2026-10-31' }, '2026-11-18')).toBeUndefined()
  })
  it('validates a manual period', () => {
    expect(isValidPeriod({ from: '2026-11-02', to: '2026-11-02' })).toBe(true)
    expect(isValidPeriod({ from: '2026-11-03', to: '2026-11-02' })).toBe(false)
    expect(isValidPeriod({ from: '', to: '2026-11-02' })).toBe(false)
  })
})
