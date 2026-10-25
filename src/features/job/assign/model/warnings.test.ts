import { describe, expect, it } from 'vitest'

import type { DispatchBoardColumnsItem } from '@/entities/dispatch'
import type { Technician } from '@/entities/technician'

import { scheduleWarnings, type WarningInput } from './warnings'

const skill = (id: string, name: string) => ({ id, name })
const technician = (
  overrides: Partial<Technician> & Pick<Technician, 'id' | 'fullName'>,
): Technician => ({
  userId: `u-${overrides.id}`,
  color: '#336699',
  workStart: '08:00',
  workEnd: '16:00',
  workingDays: [1, 2, 3, 4, 5],
  skillIds: ['s1'],
  skills: [skill('s1', 'Prva'), skill('s2', 'Druga')],
  isActive: true,
  ...overrides,
})

const ana = technician({ id: 'a', fullName: 'Ana' })
const ben = technician({ id: 'b', fullName: 'Ben', skillIds: [] })

const base = (overrides: Partial<WarningInput> = {}): WarningInput => ({
  job: { id: 'j', durationMin: 60, requiredPeople: 1 },
  requiredSkillIds: [],
  technicians: [ana],
  allTechnicians: [ana, ben],
  date: '2026-10-26', // Monday
  time: '09:00',
  columns: [],
  timeZone: 'Europe/Zagreb',
  ...overrides,
})

const kinds = (input: WarningInput) => scheduleWarnings(input).map((warning) => warning.kind)

describe('scheduleWarnings', () => {
  it('nothing to warn about for a fitting plan', () => {
    expect(scheduleWarnings(base())).toEqual([])
  })

  it('missing skills, by name, from the job type', () => {
    expect(scheduleWarnings(base({ technicians: [ben], requiredSkillIds: ['s1', 's2'] }))).toEqual([
      { kind: 'missingSkills', name: 'Ben', skills: ['Prva', 'Druga'] },
    ])
    expect(kinds(base({ requiredSkillIds: ['s1'] }))).toEqual([])
  })

  it('a day off, or hours the job does not fit in (but not both for one technician)', () => {
    expect(kinds(base({ date: '2026-10-31' }))).toEqual(['dayOff']) // Saturday
    expect(kinds(base({ time: '15:30' }))).toEqual(['outsideHours'])
    expect(kinds(base({ time: '07:00' }))).toEqual(['outsideHours'])
    expect(kinds(base({ date: '2026-10-31', time: '07:00' }))).toEqual(['dayOff'])
    // Without a start time there are no hours to check
    expect(kinds(base({ time: '' }))).toEqual([])
  })

  it('fewer technicians than the job needs (none selected is the form’s own error)', () => {
    const job = { id: 'j', durationMin: 60, requiredPeople: 2 }
    expect(scheduleWarnings(base({ job }))).toEqual([{ kind: 'crew', required: 2, selected: 1 }])
    expect(kinds(base({ job, technicians: [ana, ben] }))).toEqual([])
    expect(kinds(base({ job, technicians: [] }))).toEqual([])
  })

  it("overlap with the technician's other jobs that day, in the tenant's zone", () => {
    const other = (id: string, start: string, durationMin: number) => ({
      id,
      number: `RN-${id}`,
      scheduledStart: start,
      durationMin,
    })
    const column = {
      technician: { id: 'a', fullName: 'Ana', color: '#336699' },
      workStart: '08:00',
      workEnd: '16:00',
      isWorkingDay: true,
      jobs: [
        other('1', '2026-10-26T08:30:00Z', 60), // 09:30–10:30 in Zagreb
        other('2', '2026-10-26T10:00:00Z', 60), // 11:00–12:00
        { ...other('j', '2026-10-26T08:00:00Z', 60) }, // the job itself: ignored
        { ...other('3', '', 60), scheduledStart: undefined }, // no start: ignored
      ],
    } as unknown as DispatchBoardColumnsItem
    expect(scheduleWarnings(base({ time: '10:00', columns: [column] }))).toEqual([
      { kind: 'overlap', name: 'Ana', number: 'RN-1' },
    ])
    // Touching is not overlapping
    expect(kinds(base({ time: '12:00', columns: [column] }))).toEqual([])
    expect(kinds(base({ time: '08:30', columns: [column] }))).toEqual([])
  })
})
