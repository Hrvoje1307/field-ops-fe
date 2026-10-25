import { describe, expect, it } from 'vitest'

import { dropRequest, isDraggable, lockRequest, QUEUE_ID, startsOutOfOrder } from './drop'

const job = {
  locked: false,
  requiredPeople: 1,
  technicians: [],
  status: 'new' as const,
}

describe('isDraggable', () => {
  it('allows a plain job that can still be scheduled', () => {
    expect(isDraggable(job)).toBe(true)
    expect(isDraggable({ ...job, status: 'scheduled' })).toBe(true)
  })

  it('keeps locked jobs, crews and jobs under way where they are', () => {
    expect(isDraggable({ ...job, locked: true })).toBe(false)
    expect(isDraggable({ ...job, requiredPeople: 2 })).toBe(false)
    expect(
      isDraggable({
        ...job,
        technicians: [
          { id: 'a', fullName: 'A', color: '#000000', isLead: true },
          { id: 'b', fullName: 'B', color: '#000000', isLead: false },
        ],
      }),
    ).toBe(false)
    expect(isDraggable({ ...job, status: 'on_site' })).toBe(false)
    expect(isDraggable({ ...job, status: 'completed' })).toBe(false)
  })
})

describe('dropRequest', () => {
  it('schedules for the board day with the technician and position, and clears an old start', () => {
    expect(
      dropRequest({ itemId: 'j', fromId: QUEUE_ID, toId: 'tech-1', index: 2 }, '2026-10-26'),
    ).toEqual({
      technicianIds: ['tech-1'],
      leadTechnicianId: 'tech-1',
      scheduledDate: '2026-10-26',
      scheduledStart: null,
      sequence: 2,
    })
  })

  it('keeps a start agreed for this day: it is left out of the request, not cleared', () => {
    const request = dropRequest(
      { itemId: 'j', fromId: 'tech-1', toId: 'tech-2', index: 1 },
      '2026-10-26',
      { scheduledDate: '2026-10-26', scheduledStart: '2026-10-26T08:00:00Z' },
    )
    expect(request).toMatchObject({ technicianIds: ['tech-2'], sequence: 1 })
    expect(request && 'scheduledStart' in request).toBe(false)
  })

  it('clears a start that belongs to another day, and has nothing to keep without one', () => {
    for (const job of [
      { scheduledDate: '2026-10-25', scheduledStart: '2026-10-25T08:00:00Z' },
      { scheduledDate: '2026-10-26', scheduledStart: null },
      { scheduledDate: null, scheduledStart: null },
    ]) {
      expect(
        dropRequest({ itemId: 'j', fromId: QUEUE_ID, toId: 'tech-1', index: 0 }, '2026-10-26', job),
      ).toMatchObject({ scheduledStart: null })
    }
  })

  it('moves between technicians the same way', () => {
    expect(
      dropRequest({ itemId: 'j', fromId: 'tech-1', toId: 'tech-2', index: 0 }, '2026-10-26'),
    ).toMatchObject({ technicianIds: ['tech-2'], sequence: 0 })
  })

  it('takes it off the schedule in the queue, and ignores moving inside the queue', () => {
    expect(
      dropRequest({ itemId: 'j', fromId: 'tech-1', toId: QUEUE_ID, index: 0 }, '2026-10-26'),
    ).toEqual({ technicianIds: [] })
    expect(
      dropRequest({ itemId: 'j', fromId: QUEUE_ID, toId: QUEUE_ID, index: 1 }, '2026-10-26'),
    ).toBeNull()
  })
})

describe('lockRequest', () => {
  const scheduled = {
    locked: false,
    scheduledDate: '2026-10-26',
    scheduledStart: '2026-10-26T08:00:00Z',
    technicians: [
      { id: 'a', fullName: 'A', color: '#000000', isLead: false },
      { id: 'b', fullName: 'B', color: '#000000', isLead: true },
    ],
  }

  it('flips the lock and sends the schedule as it is', () => {
    expect(lockRequest(scheduled)).toEqual({
      technicianIds: ['a', 'b'],
      leadTechnicianId: 'b',
      scheduledDate: '2026-10-26',
      scheduledStart: '2026-10-26T08:00:00Z',
      locked: true,
    })
    expect(lockRequest({ ...scheduled, locked: true }).locked).toBe(false)
  })
})

describe('startsOutOfOrder', () => {
  const at = (id: string, time: string | null) => ({
    id,
    scheduledStart: time ? `2026-10-26T${time}:00Z` : null,
  })

  it('is fine when the starts run forwards, whatever the untimed jobs do', () => {
    expect(startsOutOfOrder([at('a', '08:00'), at('x', null), at('b', '10:00')], 'b')).toBe(false)
    expect(startsOutOfOrder([at('b', '10:00')], 'b')).toBe(false)
    expect(startsOutOfOrder([at('x', null), at('y', null)], 'x')).toBe(false)
  })

  it('is out of order when the moved job stands before an earlier one or after a later one', () => {
    expect(startsOutOfOrder([at('b', '10:00'), at('a', '08:00')], 'b')).toBe(true)
    expect(startsOutOfOrder([at('b', '10:00'), at('a', '08:00')], 'a')).toBe(true)
    expect(startsOutOfOrder([at('a', '08:00'), at('c', '12:00'), at('b', '10:00')], 'b')).toBe(true)
  })

  it('a job with no start, or one that is not there, is never out of order', () => {
    expect(startsOutOfOrder([at('b', '10:00'), at('x', null), at('a', '08:00')], 'x')).toBe(false)
    expect(startsOutOfOrder([at('a', '08:00')], 'missing')).toBe(false)
  })
})
