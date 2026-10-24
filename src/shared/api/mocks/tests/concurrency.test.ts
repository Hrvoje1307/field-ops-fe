import { beforeEach, describe, expect, it } from 'vitest'

import type { Client, Job, ProblemDetails } from '@/shared/api/generated/model'

import { resetMockDb } from '../db'
import { clientId, jobId, loginAs, USERS } from './client'

beforeEach(() => {
  resetMockDb()
})

const clientUpdate = (client: Client) => ({
  type: client.type,
  name: client.name,
  oib: client.oib ?? null,
  email: client.email ?? null,
  notes: client.notes ?? null,
  contacts: client.contacts,
  customFields: client.customFields,
  version: client.version,
})

describe('stale version → 409', () => {
  it('PUT /clients/{id}', async () => {
    const s = await loginAs(USERS.alarmkoDispatcher)
    const id = clientId('alarmko', 'Ana Čulić')
    const client = (await s.get<Client>(`/clients/${id}`)).body

    const first = await s.put<Client>(`/clients/${id}`, {
      ...clientUpdate(client),
      notes: 'Prva izmjena',
    })
    expect(first.status).toBe(200)
    expect(first.body.version).toBe(client.version + 1)

    const stale = await s.put<ProblemDetails>(`/clients/${id}`, {
      ...clientUpdate(client),
      notes: 'Zakašnjela izmjena',
    })
    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('client.version_conflict')
  })

  it('PUT /jobs/{id}, /transition and /assign', async () => {
    const s = await loginAs(USERS.alarmkoDispatcher)
    const id = jobId('alarmko', 'Redovni servis', 'Nikola Perić')
    const job = (await s.get<Job>(`/jobs/${id}`)).body
    const staleVersion = job.version

    // Someone else changes the job first
    expect(
      (
        await s.post(`/jobs/${id}/assign`, {
          technicianIds: [],
          locked: true,
          version: job.version,
        })
      ).status,
    ).toBe(200)

    const update = await s.put<ProblemDetails>(`/jobs/${id}`, {
      clientId: job.client.id,
      locationId: job.location.id,
      jobTypeId: job.jobType.id,
      title: 'Novi naslov',
      version: staleVersion,
    })
    expect(update.status).toBe(409)
    expect(update.body.code).toBe('job.version_conflict')
    expect(
      (
        await s.post(`/jobs/${id}/transition`, {
          to: 'cancelled',
          note: 'x',
          version: staleVersion,
        })
      ).status,
    ).toBe(409)
    expect(
      (await s.post(`/jobs/${id}/assign`, { technicianIds: [], version: staleVersion })).status,
    ).toBe(409)
  })

  it('omitting version skips the check where the spec makes it optional', async () => {
    const s = await loginAs(USERS.alarmkoDispatcher)
    const id = jobId('alarmko', 'Redovni servis', 'Nikola Perić')
    expect(
      (await s.post(`/jobs/${id}/transition`, { to: 'cancelled', note: 'Klijent odustao.' }))
        .status,
    ).toBe(200)
  })
})
