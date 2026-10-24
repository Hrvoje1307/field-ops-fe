import { describe, expect, it } from 'vitest'

import type { JobValues, NewClientValues, NewLocationValues } from '../model/schema'
import { toClientCreate, toJobCreate, toLocationInput } from './requests'

const client: NewClientValues = {
  kind: 'new',
  type: 'person',
  name: 'Ana Horvat',
  contactName: '',
  phone: '091 234 5678',
  email: '',
  oib: '',
  customFields: { ref: 'K-1' },
}
const location: NewLocationValues = {
  kind: 'new',
  street: 'Ilica 1',
  city: 'Zagreb',
  postalCode: '',
  label: '',
  accessNotes: 'Zvono 3',
  accessCodes: '',
  customFields: {},
}
const job: JobValues = {
  jobTypeId: 'jt1',
  title: 'Kvar',
  description: '',
  priority: 'urgent',
  source: 'phone',
  preferredDate: '2026-10-27',
  windowStart: '08:00',
  windowEnd: '',
  durationMin: undefined,
  requiredPeople: 2,
  internalNote: '',
  customFields: { reference: 'R-1' },
}

describe('request bodies', () => {
  it('a person is their own primary contact; empty texts are null; the tenant country', () => {
    expect(toClientCreate(client, location, 'HR')).toEqual({
      type: 'person',
      name: 'Ana Horvat',
      oib: null,
      contacts: [{ name: 'Ana Horvat', phone: '091 234 5678', email: null, isPrimary: true }],
      customFields: { ref: 'K-1' },
      firstLocation: {
        street: 'Ilica 1',
        city: 'Zagreb',
        postalCode: null,
        label: null,
        accessNotes: 'Zvono 3',
        country: 'HR',
        customFields: {},
      },
    })
  })

  it("a company's contact is its contact person, or the company name when left empty", () => {
    const company = { ...client, type: 'company' as const, name: 'Pekara d.o.o.' }
    expect(
      toClientCreate({ ...company, contactName: 'Goran' }, location, 'HR').contacts[0]?.name,
    ).toBe('Goran')
    expect(toClientCreate(company, location, 'HR').contacts[0]?.name).toBe('Pekara d.o.o.')
  })

  it('access codes only when typed (write-only); no country when the tenant has none', () => {
    expect(toLocationInput(location, undefined)).not.toHaveProperty('accessCodes')
    expect(toLocationInput(location, undefined)).not.toHaveProperty('country')
    expect(toLocationInput({ ...location, accessCodes: '1234#' }, 'US')).toMatchObject({
      accessCodes: '1234#',
      country: 'US',
    })
  })

  it('the job: picked ids, nulls for empty texts, defaults left to the job type', () => {
    expect(toJobCreate(job, { clientId: 'c1', locationId: 'l1', assetId: '' })).toEqual({
      clientId: 'c1',
      locationId: 'l1',
      assetId: null,
      jobTypeId: 'jt1',
      title: 'Kvar',
      description: null,
      priority: 'urgent',
      source: 'phone',
      preferredDate: '2026-10-27',
      windowStart: '08:00',
      windowEnd: null,
      requiredPeople: 2,
      internalNote: null,
      customFields: { reference: 'R-1' },
    })
  })
})
