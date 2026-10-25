import { describe, expect, it } from 'vitest'

import type { Technician } from '@/shared/api/generated/model'

import {
  buildTechnicianSchema,
  technicianFormValues,
  type TechnicianFormValues,
  toTechnicianBody,
  toTechnicianCreateBody,
} from './technician-form'

const stored: Technician = {
  id: 't1',
  userId: 'u1',
  fullName: 'Ivan Horvat',
  phone: null,
  color: '#B91C1C',
  workStart: '07:30',
  workEnd: '15:30',
  workingDays: [5, 1, 3],
  skillIds: ['s1'],
  isActive: true,
  depotId: 'd1',
  skills: [],
  depot: null,
}

const messages = (change: Partial<TechnicianFormValues>) => {
  const result = buildTechnicianSchema().safeParse({ ...technicianFormValues(stored), ...change })
  const found: Record<string, string> = {}
  if (!result.success) {
    for (const issue of result.error.issues) found[String(issue.path[0])] = issue.message
  }
  return found
}

describe('technician form', () => {
  it('a stored technician is valid as it is', () => {
    expect(messages({})).toEqual({})
  })

  it('needs a #rrggbb colour and working hours in order', () => {
    expect(messages({ color: 'plava', workStart: '8', workEnd: '' })).toEqual({
      color: 'Upišite boju kao #rrggbb.',
      workStart: 'Upišite vrijeme, npr. 08:00.',
      workEnd: 'Upišite vrijeme, npr. 08:00.',
    })
    expect(messages({ workStart: '16:00', workEnd: '08:00' })).toEqual({
      workEnd: 'Kraj radnog vremena mora biti nakon početka.',
    })
    expect(messages({ workStart: '08:00', workEnd: '08:00' }).workEnd).toBeDefined()
  })

  it('works at least one day', () => {
    expect(messages({ workingDays: [] })).toEqual({
      workingDays: 'Odaberite barem jedan radni dan.',
    })
  })

  it('starts a new technician on weekdays, 8 to 16, active, with nothing else yet', () => {
    expect(technicianFormValues()).toEqual({
      color: '#2563eb',
      workStart: '08:00',
      workEnd: '16:00',
      workingDays: [1, 2, 3, 4, 5],
      depotId: '',
      skillIds: [],
      isActive: true,
    })
  })

  it('opens a stored technician with the days in order and its own copy of the lists', () => {
    const values = technicianFormValues(stored)
    expect(values.workingDays).toEqual([1, 3, 5])
    values.skillIds.push('x')
    expect(stored.skillIds).toEqual(['s1'])
  })

  it('sends a lower-case colour, null for no depot and the days in order once each', () => {
    const body = toTechnicianBody({
      ...technicianFormValues(stored),
      depotId: '',
      workingDays: [5, 1, 1, 3],
    })
    expect(body).toEqual({
      depotId: null,
      color: '#b91c1c',
      workStart: '07:30',
      workEnd: '15:30',
      workingDays: [1, 3, 5],
      skillIds: ['s1'],
      isActive: true,
    })
  })

  it('a new technician carries the member’s id', () => {
    expect(toTechnicianCreateBody('u9', technicianFormValues())).toMatchObject({
      userId: 'u9',
      workingDays: [1, 2, 3, 4, 5],
    })
  })
})
