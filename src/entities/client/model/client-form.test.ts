import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import type { Client } from '@/shared/api/generated/model'

import { buildClientSchema, clientFormValues, emptyContact, toClientBody } from './client-form'

const customFields = z.record(z.string(), z.string())

const stored: Client = {
  id: 'c1',
  type: 'company',
  name: 'Pekara d.o.o.',
  oib: null,
  email: 'ured@pekara.test',
  notes: null,
  contacts: [
    {
      id: 'k1',
      name: 'Goran',
      phone: '+385912100001',
      email: null,
      isPrimary: true,
      receivesSms: true,
    },
    { id: 'k2', name: 'Smjena', phone: null, email: null, isPrimary: false, receivesSms: false },
  ],
  locations: [],
  customFields: { ref: 'A' },
  version: 7,
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-10-01T08:00:00Z',
}

describe('clientFormValues', () => {
  it('a stored client: contacts with their ids, phones as people type them', () => {
    const values = clientFormValues(stored, { ref: 'A' }, (phone) => `fmt(${phone})`)
    expect(values).toMatchObject({ type: 'company', name: 'Pekara d.o.o.', oib: '', notes: '' })
    expect(values.contacts).toEqual([
      {
        contactId: 'k1',
        name: 'Goran',
        phone: 'fmt(+385912100001)',
        email: '',
        isPrimary: true,
        receivesSms: true,
      },
      {
        contactId: 'k2',
        name: 'Smjena',
        phone: '',
        email: '',
        isPrimary: false,
        receivesSms: false,
      },
    ])
  })

  it('a new client: a person with one primary contact', () => {
    expect(clientFormValues(undefined, {}).contacts).toEqual([emptyContact(true)])
  })
})

describe('toClientBody', () => {
  it('keeps contact ids (update), leaves them out for new ones, sends the version', () => {
    const values = clientFormValues(stored, { ref: 'A' })
    values.contacts.push({ ...emptyContact(false), name: 'Novi', phone: '091 765 4321' })
    const body = toClientBody(values, 7)
    expect(body.version).toBe(7)
    expect(body.contacts).toEqual([
      {
        id: 'k1',
        name: 'Goran',
        phone: '+385912100001',
        email: null,
        isPrimary: true,
        receivesSms: true,
      },
      { id: 'k2', name: 'Smjena', phone: null, email: null, isPrimary: false, receivesSms: false },
      { name: 'Novi', phone: '091 765 4321', email: null, isPrimary: false, receivesSms: true },
    ])
    expect(body).toMatchObject({ oib: null, email: 'ured@pekara.test', notes: null })
  })

  it('exactly one primary contact: the first marked, or the first one', () => {
    const values = clientFormValues(stored, {})
    values.contacts = values.contacts.map((contact) => ({ ...contact, isPrimary: true }))
    expect(toClientBody(values).contacts.map((c) => c.isPrimary)).toEqual([true, false])
    values.contacts = values.contacts.map((contact) => ({ ...contact, isPrimary: false }))
    expect(toClientBody(values).contacts.map((c) => c.isPrimary)).toEqual([true, false])
    expect(toClientBody(values)).not.toHaveProperty('version')
  })
})

describe('buildClientSchema', () => {
  const schema = buildClientSchema(customFields)
  const errors = (input: unknown) => {
    const result = schema.safeParse(input)
    return result.success
      ? {}
      : Object.fromEntries(
          result.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
        )
  }

  it('needs a name and at least one named contact; checks email and OIB', () => {
    expect(
      errors({ ...clientFormValues(undefined, {}), oib: '12', email: 'x@', contacts: [] }),
    ).toEqual({
      name: 'Upišite ime ili naziv.',
      oib: 'OIB ima 11 znamenki.',
      email: 'Upišite ispravan email.',
      contacts: 'Dodajte barem jedan kontakt.',
    })
    expect(errors({ ...clientFormValues(stored, {}), contacts: [emptyContact(true)] })).toEqual({
      'contacts.0.name': 'Upišite ime kontakta.',
    })
  })
})
