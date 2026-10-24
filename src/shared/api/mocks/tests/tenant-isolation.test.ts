import { beforeEach, describe, expect, it } from 'vitest'

import type {
  ClientSummaryPage,
  Job,
  JobSummaryPage,
  ValidationProblemDetails,
} from '@/shared/api/generated/model'

import { resetMockDb } from '../db'
import { clientId, jobId, loginAs, tenantBySlug, USERS } from './client'

beforeEach(() => {
  resetMockDb()
})

describe('tenant isolation', () => {
  it("returns 404 for another tenant's client, location, asset and job", async () => {
    const alarmko = await loginAs(USERS.alarmkoDispatcher)
    const bura = tenantBySlug('bura-klima')
    const buraClient = clientId('bura-klima', 'Hotel Lučica d.o.o.')
    const buraLocation = bura.locations.find((l) => l.clientId === buraClient)?.id ?? ''
    const buraAsset = bura.assets.find((a) => a.locationId === buraLocation)?.id ?? ''
    const buraJob = jobId('bura-klima', 'Servis klime — recepcija')

    for (const path of [
      `/clients/${buraClient}`,
      `/clients/${buraClient}/locations`,
      `/locations/${buraLocation}`,
      `/locations/${buraLocation}/assets`,
      `/assets/${buraAsset}`,
      `/jobs/${buraJob}`,
      `/jobs/${buraJob}/history`,
      `/technicians/${bura.technicians[0]?.id ?? ''}`,
    ]) {
      expect((await alarmko.get(path)).status, path).toBe(404)
    }
  })

  it("can't change or delete another tenant's data", async () => {
    const alarmko = await loginAs(USERS.alarmkoOwner)
    const buraClient = clientId('bura-klima', 'Ante Božić')
    const buraJob = jobId('bura-klima', 'Klima curi u spavaćoj sobi')

    expect(
      (
        await alarmko.put(`/clients/${buraClient}`, {
          type: 'person',
          name: 'Hijacked',
          contacts: [{ name: 'X' }],
        })
      ).status,
    ).toBe(404)
    expect((await alarmko.del(`/clients/${buraClient}`)).status).toBe(404)
    expect(
      (await alarmko.post(`/jobs/${buraJob}/transition`, { to: 'cancelled', note: 'x' })).status,
    ).toBe(404)
    expect((await alarmko.post(`/jobs/${buraJob}/assign`, { technicianIds: [] })).status).toBe(404)

    // Untouched for its owner
    const bura = await loginAs(USERS.buraDispatcher)
    expect((await bura.get<Job>(`/jobs/${buraJob}`)).body.status).toBe('scheduled')
  })

  it("doesn't accept another tenant's ids inside a request body", async () => {
    const alarmko = await loginAs(USERS.alarmkoDispatcher)
    const bura = tenantBySlug('bura-klima')
    const buraClient = clientId('bura-klima', 'Ante Božić')
    const response = await alarmko.post<ValidationProblemDetails>('/jobs', {
      clientId: buraClient,
      locationId: bura.locations.find((l) => l.clientId === buraClient)?.id,
      jobTypeId: bura.jobTypes[0]?.id,
      title: 'Cross-tenant job',
    })
    expect(response.status).toBe(400)
    expect(Object.keys(response.body.errors)).toEqual(
      expect.arrayContaining(['clientId', 'locationId', 'jobTypeId']),
    )
  })

  it('lists only the signed-in tenant', async () => {
    const alarmko = await loginAs(USERS.alarmkoDispatcher)
    const clients = (await alarmko.get<ClientSummaryPage>('/clients?pageSize=200')).body
    const ownIds = new Set(tenantBySlug('alarmko').clients.map((c) => c.id))
    expect(clients.items.every((c) => ownIds.has(c.id))).toBe(true)

    const filtered = await alarmko.get<JobSummaryPage>(
      `/jobs?clientId=${clientId('bura-klima', 'Ante Božić')}`,
    )
    expect(filtered.body.totalCount).toBe(0)
  })

  it('takes the tenant from the token after switching, never from the request', async () => {
    const ana = await loginAs(USERS.ana) // dispatcher in both, starts in Alarmko
    const buraJob = jobId('bura-klima', 'Klima curi u spavaćoj sobi')
    expect((await ana.get(`/jobs/${buraJob}`)).status).toBe(404)
  })
})
