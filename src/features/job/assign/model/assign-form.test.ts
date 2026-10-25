import { describe, expect, it } from 'vitest'

import { assignFormValues, buildAssignSchema, toAssignRequest } from './assign-form'

const ZAGREB = 'Europe/Zagreb'
const technicians = [
  { id: 't1', fullName: 'A', color: '#111111', isLead: false },
  { id: 't2', fullName: 'B', color: '#222222', isLead: true },
]

describe('assignFormValues', () => {
  const unscheduled = {
    scheduledDate: null,
    scheduledStart: null,
    preferredDate: null,
    windowStart: null,
    technicians: [],
  }

  it('an unscheduled job: the day being looked at, else the preferred date, else today', () => {
    const options = { today: '2026-10-25', timeZone: ZAGREB }
    expect(assignFormValues(unscheduled, { ...options, day: '2026-10-28' }).date).toBe('2026-10-28')
    expect(assignFormValues({ ...unscheduled, preferredDate: '2026-11-02' }, options).date).toBe(
      '2026-11-02',
    )
    expect(assignFormValues(unscheduled, options).date).toBe('2026-10-25')
  })

  it("a scheduled job: its own date, start in the tenant's zone, technicians and lead", () => {
    const values = assignFormValues(
      {
        ...unscheduled,
        scheduledDate: '2026-10-26',
        // 08:30 UTC is 09:30 in Zagreb (CET) on 26 October
        scheduledStart: '2026-10-26T08:30:00Z',
        technicians,
      },
      { day: '2026-12-01', today: '2026-10-25', timeZone: ZAGREB },
    )
    expect(values).toEqual({
      date: '2026-10-26',
      time: '09:30',
      technicianIds: ['t1', 't2'],
      leadId: 't2',
    })
  })

  it("the client's time window starts the time when nothing is scheduled", () => {
    expect(
      assignFormValues(
        { ...unscheduled, windowStart: '08:00' },
        { today: '2026-10-25', timeZone: ZAGREB },
      ).time,
    ).toBe('08:00')
  })
})

describe('toAssignRequest', () => {
  const values = { date: '2026-10-26', time: '09:30', technicianIds: ['t1', 't2'], leadId: 't2' }

  it('sends the tenant-local date and time as a UTC instant, with the version', () => {
    expect(toAssignRequest(values, { timeZone: ZAGREB, version: 4 })).toEqual({
      technicianIds: ['t1', 't2'],
      leadTechnicianId: 't2',
      scheduledDate: '2026-10-26',
      scheduledStart: '2026-10-26T08:30:00Z',
      version: 4,
    })
  })

  it('across the daylight-saving change the offset follows the date', () => {
    // Clocks went back on 25 October: 09:30 is UTC+1 after, UTC+2 before
    expect(
      toAssignRequest({ ...values, date: '2026-10-24' }, { timeZone: ZAGREB, version: 1 })
        .scheduledStart,
    ).toBe('2026-10-24T07:30:00Z')
    expect(
      toAssignRequest({ ...values, date: '2026-10-26' }, { timeZone: ZAGREB, version: 1 })
        .scheduledStart,
    ).toBe('2026-10-26T08:30:00Z')
  })

  it('no time: the day only; the lead falls back to the first when deselected', () => {
    const request = toAssignRequest(
      { ...values, time: '', technicianIds: ['t1'], leadId: 't2' },
      { timeZone: ZAGREB, version: 1 },
    )
    expect(request).toMatchObject({ scheduledStart: null, leadTechnicianId: 't1' })
  })
})

describe('buildAssignSchema', () => {
  const errors = (input: unknown) => {
    const result = buildAssignSchema().safeParse(input)
    return result.success
      ? {}
      : Object.fromEntries(
          result.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
        )
  }

  it('needs a real date, a valid time (or none) and a technician', () => {
    expect(errors({ date: '2026-02-30', time: '25:00', technicianIds: [], leadId: '' })).toEqual({
      date: 'Odaberite datum.',
      time: 'Upišite vrijeme kao 08:30.',
      technicianIds: 'Odaberite barem jednog montera.',
    })
    expect(errors({ date: '2026-10-26', time: '', technicianIds: ['t1'], leadId: 't1' })).toEqual(
      {},
    )
  })
})
