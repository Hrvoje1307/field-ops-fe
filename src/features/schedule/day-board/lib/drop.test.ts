import { describe, expect, it } from 'vitest'

import { dropRequest, isDraggable, lockRequest, QUEUE_ID } from './drop'

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
