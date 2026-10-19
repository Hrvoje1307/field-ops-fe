import { beforeEach, describe, expect, it } from 'vitest'

import type { Job, Location, TechnicianDay } from '@/shared/api/generated/model'
import { todayInTimeZone } from '@/shared/lib/datetime'

import { resetMockDb } from '../db'
import { clientId, jobId, loginAs, technicianId, tenantBySlug, USERS } from './client'

beforeEach(() => {
  resetMockDb()
})

const today = () => todayInTimeZone('Europe/Zagreb')
const durdevicLocation = () =>
  tenantBySlug('alarmko').locations.find(
    (l) => l.clientId === clientId('alarmko', 'Tomislav Đurđević'),
  )?.id ?? ''

describe('access codes and sensitive custom fields', () => {
  it('are returned to the office', async () => {
    const s = await loginAs(USERS.alarmkoDispatcher)
    const location = (await s.get<Location>(`/locations/${durdevicLocation()}`)).body
    expect(location).toMatchObject({ accessCodes: 'Kapija 2580', hasAccessCodes: true })
    expect(location.customFields).toEqual({ alarm_code: '1357' })
  })

  it('are returned to the technician assigned to an open job there', async () => {
    const petra = await loginAs(USERS.petra)
    const day = (await petra.get<TechnicianDay>(`/me/jobs?date=${today()}`)).body
    const visit = day.jobs.find((j) => j.client.name === 'Tomislav Đurđević')
    expect(visit?.locationDetail).toMatchObject({
      accessCodes: 'Kapija 2580',
      hasAccessCodes: true,
    })
    expect(visit?.locationDetail?.customFields).toEqual({ alarm_code: '1357' })
  })

  it('stay hidden on other locations of the same client (hasAccessCodes still set)', async () => {
    // Petra's visit to the bakery is at Savska; the Ilica shop has codes she isn't sent to
    const petra = await loginAs(USERS.petra)
    const job = (await petra.get<Job>(`/jobs/${jobId('alarmko', 'Servis — Pekara Savska')}`)).body
    const ilica = job.clientDetail?.locations.find((l) => l.label === 'Pekara Ilica')
    expect(ilica?.hasAccessCodes).toBe(true)
    expect(ilica).not.toHaveProperty('accessCodes')
    expect(ilica?.customFields).toEqual({})
  })

  it('are hidden again once the job is closed', async () => {
    const t = tenantBySlug('bura-klima')
    const dispatcher = await loginAs(USERS.buraDispatcher)
    const ante = await loginAs(USERS.ante)
    const id = jobId('bura-klima', 'Voda kapa iz unutarnje jedinice') // Apartmani Bačvice A2, has codes
    await dispatcher.post(`/jobs/${id}/assign`, {
      technicianIds: [technicianId('bura-klima', USERS.ante)],
      scheduledDate: today(),
    })
    expect((await ante.get<Job>(`/jobs/${id}`)).body.locationDetail?.accessCodes).toBe(
      'Kutija za ključeve 7314',
    )

    await dispatcher.post(`/jobs/${id}/transition`, {
      to: 'cancelled',
      note: 'Riješeno telefonom.',
    })
    const closed = (await ante.get<Job>(`/jobs/${id}`)).body
    expect(closed.locationDetail).not.toHaveProperty('accessCodes')
    expect(closed.locationDetail?.hasAccessCodes).toBe(true)
    expect(t.locations.find((l) => l.id === closed.location.id)?.accessCodes).toBe(
      'Kutija za ključeve 7314',
    )
  })

  it('are write-only on PUT: omitted keeps them, null clears them', async () => {
    const s = await loginAs(USERS.alarmkoDispatcher)
    const location = (await s.get<Location>(`/locations/${durdevicLocation()}`)).body
    const input = {
      label: location.label ?? null,
      street: location.street,
      city: location.city,
      postalCode: location.postalCode ?? null,
      country: location.country,
      lat: location.lat ?? null,
      lng: location.lng ?? null,
      accessNotes: 'Pas je sada u kućici.',
      customFields: location.customFields,
    }
    const kept = await s.put<Location>(`/locations/${location.id}`, input)
    expect(kept.body).toMatchObject({
      accessCodes: 'Kapija 2580',
      accessNotes: 'Pas je sada u kućici.',
    })

    const cleared = await s.put<Location>(`/locations/${location.id}`, {
      ...input,
      accessCodes: null,
    })
    expect(cleared.body).toMatchObject({ accessCodes: null, hasAccessCodes: false })
  })
})
