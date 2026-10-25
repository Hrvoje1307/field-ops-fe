import { describe, expect, it } from 'vitest'

import { isoWeekday, minutesOf, missingSkillIds, withinHours, worksOn } from './working-time'

const technician = {
  workingDays: [1, 2, 3, 4, 5],
  workStart: '08:00',
  workEnd: '16:00',
  skillIds: ['s1'],
}

describe('working time', () => {
  it('ISO weekday of a plain date', () => {
    expect(isoWeekday('2026-10-26')).toBe(1) // Monday
    expect(isoWeekday('2026-10-25')).toBe(7) // Sunday (DST change day)
  })

  it('working days and hours', () => {
    expect(worksOn(technician, '2026-10-30')).toBe(true) // Friday
    expect(worksOn(technician, '2026-10-31')).toBe(false) // Saturday
    expect(withinHours(technician, '08:00', 60)).toBe(true)
    expect(withinHours(technician, '15:30', 30)).toBe(true)
    expect(withinHours(technician, '15:30', 45)).toBe(false)
    expect(withinHours(technician, '07:45', 30)).toBe(false)
    expect(minutesOf('09:30', 15)).toBe(585)
  })

  it('skills the job type requires that are missing', () => {
    expect(missingSkillIds(technician, ['s1', 's2'])).toEqual(['s2'])
    expect(missingSkillIds(technician, [])).toEqual([])
  })
})
