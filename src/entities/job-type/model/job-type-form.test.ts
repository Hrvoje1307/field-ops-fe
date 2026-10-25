import { describe, expect, it } from 'vitest'

import type { JobType } from '@/shared/api/generated/model'

import {
  buildJobTypeSchema,
  jobTypeFormValues,
  type JobTypeFormValues,
  toJobTypeBody,
} from './job-type-form'

const stored: JobType = {
  id: '1',
  name: 'Servis',
  color: '#B91C1C',
  defaultDurationMin: 90,
  requiredPeople: 2,
  requiredSkillIds: ['s1', 's2'],
  checklistTemplateId: 'c1',
  smsEnabled: false,
  isActive: true,
}

const messages = (change: Partial<JobTypeFormValues>) => {
  const result = buildJobTypeSchema().safeParse({ ...jobTypeFormValues(stored), ...change })
  const found: Record<string, string> = {}
  if (!result.success) {
    for (const issue of result.error.issues) found[String(issue.path[0])] = issue.message
  }
  return found
}

describe('job type form', () => {
  it('a stored job type is valid as it is', () => {
    expect(messages({})).toEqual({})
  })

  it('needs a name and a #rrggbb colour', () => {
    expect(messages({ name: ' ', color: 'red' })).toEqual({
      name: 'Upišite naziv vrste naloga.',
      color: 'Upišite boju kao #rrggbb.',
    })
  })

  it('needs at least 5 minutes and 1 to 10 people', () => {
    for (const bad of ['4', '', 'sat', '1.5', '-5']) {
      expect(messages({ defaultDurationMin: bad }).defaultDurationMin, bad).toBe(
        'Trajanje je cijeli broj minuta, najmanje 5.',
      )
    }
    expect(messages({ defaultDurationMin: '5' })).toEqual({})
    for (const bad of ['0', '11', '', 'dvoje']) {
      expect(messages({ requiredPeople: bad }).requiredPeople, bad).toBe(
        'Broj ljudi je od 1 do 10.',
      )
    }
    expect(messages({ requiredPeople: '10' })).toEqual({})
  })

  it('starts a new type active, an hour long, for one person, with messages on', () => {
    expect(jobTypeFormValues()).toMatchObject({
      defaultDurationMin: '60',
      requiredPeople: '1',
      requiredSkillIds: [],
      checklistTemplateId: '',
      smsEnabled: true,
      isActive: true,
    })
  })

  it('sends numbers, a lower-case colour, and null for no checklist', () => {
    expect(toJobTypeBody(jobTypeFormValues(stored))).toEqual({
      name: 'Servis',
      color: '#b91c1c',
      defaultDurationMin: 90,
      requiredPeople: 2,
      requiredSkillIds: ['s1', 's2'],
      checklistTemplateId: 'c1',
      smsEnabled: false,
      isActive: true,
    })
    expect(
      toJobTypeBody({ ...jobTypeFormValues(stored), checklistTemplateId: '' }).checklistTemplateId,
    ).toBeNull()
  })

  it('keeps the stored skills as they are when opened', () => {
    const values = jobTypeFormValues(stored)
    values.requiredSkillIds.push('x')
    expect(stored.requiredSkillIds).toEqual(['s1', 's2'])
  })
})
