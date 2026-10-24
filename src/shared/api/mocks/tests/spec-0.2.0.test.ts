/** Additions in OpenAPI 0.2.0: Location.address and Invitation.inviteUrl. */
import { beforeEach, describe, expect, it } from 'vitest'

import type {
  Client,
  Invitation,
  Job,
  JobSummaryPage,
  Location,
} from '@/shared/api/generated/model'

import { resetMockDb } from '../db'
import { clientId, loginAs, tenantBySlug, USERS } from './client'

beforeEach(() => {
  resetMockDb()
})

describe('Location.address', () => {
  it('is "street, city" wherever a location is returned', async () => {
    const s = await loginAs(USERS.alarmkoDispatcher)
    const id = clientId('alarmko', 'Tomislav Đurđević')
    const client = (await s.get<Client>(`/clients/${id}`)).body
    expect(client.locations[0]?.address).toBe('Jarunska ulica 14, Zagreb')

    const location = (await s.get<Location>(`/locations/${client.locations[0]?.id ?? ''}`)).body
    expect(location.address).toBe('Jarunska ulica 14, Zagreb')

    const jobs = (await s.get<JobSummaryPage>(`/jobs?clientId=${id}`)).body
    const job = (await s.get<Job>(`/jobs/${jobs.items[0]?.id ?? ''}`)).body
    // The summary's address and the detail's Location.address agree
    expect(job.location.address).toBe('Jarunska ulica 14, Zagreb')
    expect(job.locationDetail?.address).toBe('Jarunska ulica 14, Zagreb')
  })

  it('follows edits', async () => {
    const s = await loginAs(USERS.buraDispatcher)
    const location = tenantBySlug('bura-klima').locations[0]
    const updated = await s.put<Location>(`/locations/${location?.id ?? ''}`, {
      street: 'Riva 1',
      city: 'Split',
    })
    expect(updated.body.address).toBe('Riva 1, Split')
  })
})

describe('Invitation.inviteUrl (mock has no SMTP)', () => {
  it('is returned on create and in the list, pointing at the invite page', async () => {
    const s = await loginAs(USERS.alarmkoOwner)
    const created = (
      await s.post<Invitation>('/users/invitations', {
        email: 'nova@alarmko.test',
        role: 'technician',
      })
    ).body
    expect(created.inviteUrl).toMatch(/\/invite\?token=inv_[0-9a-f]+$/)

    const listed = (await s.get<Invitation[]>('/users/invitations')).body
    expect(listed.find((i) => i.id === created.id)?.inviteUrl).toBe(created.inviteUrl)
    // Seeded invitations have links too, and every link is different
    expect(listed.every((i) => i.inviteUrl)).toBe(true)
    expect(new Set(listed.map((i) => i.inviteUrl)).size).toBe(listed.length)
  })
})
