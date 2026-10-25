import { describe, expect, it } from 'vitest'

import { formatWeekdays, ISO_WEEKDAYS, weekdayName } from './weekdays'

const words = { everyDay: 'svaki dan', noDays: 'ne radi' }

describe('weekdayName', () => {
  it('names ISO weekdays in the locale', () => {
    expect(weekdayName(1, 'hr-HR')).toBe('pon')
    expect(weekdayName(7, 'hr-HR')).toBe('ned')
    expect(weekdayName(1, 'hr-HR', 'long')).toBe('ponedjeljak')
    expect(weekdayName(3, 'en-GB')).toBe('Wed')
  })

  it('has seven days', () => {
    expect(ISO_WEEKDAYS).toHaveLength(7)
    expect(new Set(ISO_WEEKDAYS.map((day) => weekdayName(day, 'hr-HR'))).size).toBe(7)
  })
})

describe('formatWeekdays', () => {
  it('shows a run of three or more days as a range', () => {
    expect(formatWeekdays([1, 2, 3, 4, 5], 'hr-HR', words)).toBe('pon–pet')
    expect(formatWeekdays([2, 3, 4], 'hr-HR', words)).toBe('uto–čet')
  })

  it('lists single days and pairs', () => {
    expect(formatWeekdays([1, 3, 5], 'hr-HR', words)).toBe('pon, sri, pet')
    expect(formatWeekdays([1, 2], 'hr-HR', words)).toBe('pon, uto')
    expect(formatWeekdays([1, 2, 3, 6], 'hr-HR', words)).toBe('pon–sri, sub')
  })

  it('ignores order, repeats and days that do not exist', () => {
    expect(formatWeekdays([5, 1, 3, 3, 9, 0], 'hr-HR', words)).toBe('pon, sri, pet')
  })

  it('has words for every day and no day', () => {
    expect(formatWeekdays([1, 2, 3, 4, 5, 6, 7], 'hr-HR', words)).toBe('svaki dan')
    expect(formatWeekdays([], 'hr-HR', words)).toBe('ne radi')
  })
})
