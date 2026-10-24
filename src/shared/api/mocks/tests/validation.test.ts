import { beforeEach, describe, expect, it } from 'vitest'

import type { Asset, Client, ValidationProblemDetails } from '@/shared/api/generated/model'

import { resetMockDb } from '../db'
import { clientId, loginAs, tenantBySlug, USERS } from './client'

beforeEach(() => {
  resetMockDb()
})

const validPerson = {
  type: 'person',
  name: 'Iva Lukić',
  contacts: [{ name: 'Iva Lukić', phone: '091 300 4000' }],
  customFields: { monitoring_contract: 'standard' },
}

describe('400 ValidationProblemDetails with camelCase field paths', () => {
  it('reports required fields from the spec, nested in arrays and objects', async () => {
    const s = await loginAs(USERS.alarmkoDispatcher)
    const response = await s.post<ValidationProblemDetails>('/clients', {
      type: 'person',
      contacts: [{ phone: '091 300 4000' }],
      firstLocation: { city: 'Zagreb' },
    })
    expect(response.status).toBe(400)
    expect(response.body.errors).toEqual({
      name: ['Obavezno polje.'],
      'contacts[0].name': ['Obavezno polje.'],
      'firstLocation.street': ['Obavezno polje.'],
    })
  })

  it('checks enums and formats', async () => {
    const s = await loginAs(USERS.alarmkoDispatcher)
    const response = await s.post<ValidationProblemDetails>('/clients', {
      ...validPerson,
      type: 'robot',
      email: 'not-an-email',
      oib: '123',
    })
    expect(Object.keys(response.body.errors).sort()).toEqual(['email', 'oib', 'type'])
  })

  it('normalises phones to E.164 and rejects invalid ones', async () => {
    const s = await loginAs(USERS.alarmkoDispatcher)
    const ok = await s.post<Client>('/clients', validPerson)
    expect(ok.status).toBe(201)
    expect(ok.body.contacts[0]?.phone).toBe('+385913004000')

    const bad = await s.post<ValidationProblemDetails>('/clients', {
      ...validPerson,
      contacts: [
        { name: 'A', phone: '+385 91 300 4000' },
        { name: 'B', phone: '12' },
      ],
    })
    expect(bad.body.errors).toEqual({ 'contacts[1].phone': ['Neispravan broj telefona.'] })
  })

  it('allows only one primary contact; with none, the first becomes primary', async () => {
    const s = await loginAs(USERS.alarmkoDispatcher)
    const two = await s.post<ValidationProblemDetails>('/clients', {
      ...validPerson,
      contacts: [
        { name: 'A', isPrimary: true },
        { name: 'B', isPrimary: true },
      ],
    })
    expect(two.body.errors).toHaveProperty(['contacts[1].isPrimary'])

    const none = await s.post<Client>('/clients', {
      ...validPerson,
      contacts: [{ name: 'A' }, { name: 'B' }],
    })
    expect(none.body.contacts.map((c) => c.isPrimary)).toEqual([true, false])
  })

  describe('custom fields against their definitions', () => {
    it('required, select options and unknown keys (client)', async () => {
      const s = await loginAs(USERS.alarmkoDispatcher)
      const missing = await s.post<ValidationProblemDetails>('/clients', {
        ...validPerson,
        customFields: {},
      })
      expect(missing.body.errors).toEqual({
        'customFields.monitoring_contract': ['Obavezno polje.'],
      })

      const wrong = await s.post<ValidationProblemDetails>('/clients', {
        ...validPerson,
        customFields: { monitoring_contract: 'gold', zone_count: 3 },
      })
      expect(wrong.body.errors).toEqual({
        'customFields.monitoring_contract': ['Nedopuštena vrijednost.'],
        'customFields.zone_count': ['Nepoznato polje.'],
      })
    })

    it('type per asset type (alarm panel zones must be a number)', async () => {
      const s = await loginAs(USERS.alarmkoDispatcher)
      const t = tenantBySlug('alarmko')
      const location =
        t.locations.find((l) => l.clientId === clientId('alarmko', 'Ana Čulić'))?.id ?? ''
      const panel = t.assetTypes.find((a) => a.name === 'Alarmna centrala')?.id
      const recorder = t.assetTypes.find((a) => a.name === 'Snimač videonadzora')?.id

      const bad = await s.post<ValidationProblemDetails>(`/locations/${location}/assets`, {
        assetTypeId: panel,
        customFields: { zones: 'twelve' },
      })
      expect(bad.body.errors).toEqual({ 'customFields.zones': ['Neispravna vrijednost.'] })

      // zones only exists for alarm panels
      const other = await s.post<ValidationProblemDetails>(`/locations/${location}/assets`, {
        assetTypeId: recorder,
        customFields: { zones: 4 },
      })
      expect(other.body.errors).toEqual({ 'customFields.zones': ['Nepoznato polje.'] })

      const good = await s.post<Asset>(`/locations/${location}/assets`, {
        assetTypeId: panel,
        customFields: { zones: 12 },
      })
      expect(good.status).toBe(201)
    })

    it('select, number and date in the HVAC tenant', async () => {
      const s = await loginAs(USERS.buraDispatcher)
      const t = tenantBySlug('bura-klima')
      const location =
        t.locations.find((l) => l.clientId === clientId('bura-klima', 'Duje Radić'))?.id ?? ''
      const splitAc = t.assetTypes.find((a) => a.name === 'Split klima')?.id
      const boiler = t.assetTypes.find((a) => a.name === 'Plinski bojler')?.id

      const bad = await s.post<ValidationProblemDetails>(`/locations/${location}/assets`, {
        assetTypeId: splitAc,
        customFields: { refrigerant: 'R22', power_kw: '3.5', last_fgas_check: '2026-02-30' },
      })
      expect(bad.body.errors).toEqual({
        'customFields.refrigerant': ['Nedopuštena vrijednost.'],
        'customFields.power_kw': ['Neispravna vrijednost.'],
        'customFields.last_fgas_check': ['Neispravan datum.'],
      })

      const missingRequired = await s.post<ValidationProblemDetails>(
        `/locations/${location}/assets`,
        {
          assetTypeId: splitAc,
          customFields: {},
        },
      )
      expect(missingRequired.body.errors).toEqual({
        'customFields.refrigerant': ['Obavezno polje.'],
      })

      // power_kw applies to every asset type; refrigerant isn't defined for boilers
      const boilerAsset = await s.post<Asset>(`/locations/${location}/assets`, {
        assetTypeId: boiler,
        customFields: { power_kw: 24 },
      })
      expect(boilerAsset.status).toBe(201)
      expect(boilerAsset.body.customFields).toEqual({ power_kw: 24 })
    })

    it('in nested paths (firstLocation)', async () => {
      const s = await loginAs(USERS.alarmkoDispatcher)
      const response = await s.post<ValidationProblemDetails>('/clients', {
        ...validPerson,
        firstLocation: { street: 'Ilica 1', city: 'Zagreb', customFields: { alarm_code: 1234 } },
      })
      expect(response.body.errors).toEqual({
        'firstLocation.customFields.alarm_code': ['Neispravna vrijednost.'],
      })
    })
  })

  it('validates query parameters (paging, sort, dates)', async () => {
    const s = await loginAs(USERS.alarmkoDispatcher)
    const paging = await s.get<ValidationProblemDetails>('/clients?pageSize=500&page=0&sort=city')
    expect(Object.keys(paging.body.errors).sort()).toEqual(['page', 'pageSize', 'sort'])
    expect(
      (await s.get<ValidationProblemDetails>('/jobs?from=yesterday')).body.errors,
    ).toHaveProperty('from')
    expect((await s.get<ValidationProblemDetails>('/jobs?status=done')).status).toBe(400)
    expect(
      (await s.get<ValidationProblemDetails>('/tenant/usage?month=10-2026')).body.errors,
    ).toHaveProperty('month')
  })

  it('validates job relations and time windows', async () => {
    const s = await loginAs(USERS.alarmkoDispatcher)
    const t = tenantBySlug('alarmko')
    const response = await s.post<ValidationProblemDetails>('/jobs', {
      clientId: clientId('alarmko', 'Ana Čulić'),
      locationId: t.locations.find((l) => l.clientId === clientId('alarmko', 'Petar Babić'))?.id,
      jobTypeId: t.jobTypes[0]?.id,
      title: 'Krivi objekt',
      windowStart: '14:00',
      windowEnd: '09:00',
    })
    expect(Object.keys(response.body.errors).sort()).toEqual(['locationId', 'windowEnd'])
  })
})
