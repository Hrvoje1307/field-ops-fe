import { describe, expect, it } from 'vitest'

import { convertErrorPath, toConvertFormErrors, toConvertJob } from './requests'

describe('convert request', () => {
  it('sends only the job fields a conversion has', () => {
    const job = toConvertJob({
      jobTypeId: 'jt',
      title: 'T',
      description: '',
      priority: 'normal',
      preferredDate: '2026-11-02',
      windowStart: '',
      windowEnd: '',
      customFields: {},
    })
    expect(job).toEqual({
      jobTypeId: 'jt',
      title: 'T',
      description: null,
      priority: 'normal',
      preferredDate: '2026-11-02',
      windowStart: null,
      windowEnd: null,
      customFields: {},
    })
  })
  it('puts the server errors on the inputs', () => {
    expect(convertErrorPath('job.title', { isCompany: false })).toBe('job.title')
    expect(convertErrorPath('newClient.name', { isCompany: false })).toBe('client.name')
    expect(convertErrorPath('newClient.firstLocation.city', { isCompany: false })).toBe(
      'location.city',
    )
    expect(convertErrorPath('newClient.contacts[0].phone', { isCompany: false })).toBe(
      'client.phone',
    )
    expect(convertErrorPath('locationId', { isCompany: false })).toBe('location.locationId')
    expect(toConvertFormErrors({ 'job.jobTypeId': ['x'] }, false)).toEqual({
      'job.jobTypeId': ['x'],
    })
  })
})
