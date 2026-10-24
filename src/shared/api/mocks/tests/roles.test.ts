import { beforeEach, describe, expect, it } from 'vitest'

import type {
  Job,
  JobSummaryPage,
  JobUpdate,
  ProblemDetails,
  TechnicianDay,
} from '@/shared/api/generated/model'
import { todayInTimeZone } from '@/shared/lib/datetime'

import { getDb, resetMockDb } from '../db'
import { clientId, jobId, loginAs, technicianId, tenantBySlug, USERS } from './client'

beforeEach(() => {
  resetMockDb()
})

const today = () => todayInTimeZone('Europe/Zagreb')

/** Body of a full-replacement PUT built from a GET. */
const toUpdate = (job: Job): JobUpdate => ({
  clientId: job.client.id,
  locationId: job.location.id,
  assetId: job.assetId ?? null,
  jobTypeId: job.jobType.id,
  priority: job.priority,
  source: job.source,
  title: job.title,
  description: job.description ?? null,
  durationMin: job.durationMin,
  requiredPeople: job.requiredPeople,
  preferredDate: job.preferredDate ?? null,
  windowStart: job.windowStart ?? null,
  windowEnd: job.windowEnd ?? null,
  internalNote: job.internalNote ?? null,
  customFields: job.customFields,
  locked: job.locked,
  version: job.version,
})

describe('technicians', () => {
  it('get 403 from office-only endpoints', async () => {
    const petra = await loginAs(USERS.petra)
    const someClient = clientId('alarmko', 'Ana Čulić')
    const someJob = jobId('alarmko', 'Sirena se oglašava bez razloga')
    const checks: [string, () => Promise<{ status: number }>][] = [
      ['GET /clients', () => petra.get('/clients')],
      ['GET /clients/{id}', () => petra.get(`/clients/${someClient}`)],
      ['GET /technicians', () => petra.get('/technicians')],
      ['GET /users', () => petra.get('/users')],
      ['GET /tenant/usage', () => petra.get('/tenant/usage?month=2026-10')],
      [
        'POST /jobs',
        () =>
          petra.post('/jobs', {
            clientId: someClient,
            locationId: someClient,
            jobTypeId: someClient,
            title: 'x',
          }),
      ],
      [
        'POST /jobs/{id}/assign',
        () => petra.post(`/jobs/${someJob}/assign`, { technicianIds: [] }),
      ],
      ['POST /job-types', () => petra.post('/job-types', {})],
      ['DELETE /clients/{id}', () => petra.del(`/clients/${someClient}`)],
    ]
    for (const [label, call] of checks) expect((await call()).status, label).toBe(403)
  })

  it('only see jobs assigned to them, whatever the filters', async () => {
    const petra = await loginAs(USERS.petra)
    const petraId = technicianId('alarmko', USERS.petra)
    const t = tenantBySlug('alarmko')
    const page = (
      await petra.get<JobSummaryPage>(
        `/jobs?pageSize=200&technicianId=${technicianId('alarmko', USERS.ivan)}`,
      )
    ).body
    const assigned = new Set(
      t.assignments.filter((a) => a.technicianId === petraId).map((a) => a.jobId),
    )
    expect(page.items.every((j) => assigned.has(j.id))).toBe(true)

    const all = (await petra.get<JobSummaryPage>('/jobs?pageSize=200')).body
    expect(all.totalCount).toBe(assigned.size)
  })

  it("get 404 for someone else's job", async () => {
    const petra = await loginAs(USERS.petra)
    const ivansJob = jobId('alarmko', 'Lažne dojave iz dnevnog boravka')
    expect((await petra.get(`/jobs/${ivansJob}`)).status).toBe(404)
    expect((await petra.post(`/jobs/${ivansJob}/transition`, { to: 'en_route' })).status).toBe(404)
  })

  it('may change only internalNote on their job', async () => {
    const petra = await loginAs(USERS.petra)
    const id = jobId('alarmko', 'Godišnji servis', 'Tomislav Đurđević')
    const job = (await petra.get<Job>(`/jobs/${id}`)).body

    const noteOnly = await petra.put<Job>(`/jobs/${id}`, {
      ...toUpdate(job),
      internalNote: 'Pas je zatvoren.',
    })
    expect(noteOnly.status).toBe(200)
    expect(noteOnly.body.internalNote).toBe('Pas je zatvoren.')

    const retitled = await petra.put<ProblemDetails>(`/jobs/${id}`, {
      ...toUpdate(noteOnly.body),
      title: 'Drugi naslov',
    })
    expect(retitled.status).toBe(403)
    expect(retitled.body.code).toBe('job.field_not_editable')
  })

  it('see only their own day', async () => {
    const petra = await loginAs(USERS.petra)
    const day = await petra.get<TechnicianDay>(`/me/jobs?date=${today()}`)
    expect(day.status).toBe(200)
    expect(day.body.technician.id).toBe(technicianId('alarmko', USERS.petra))
    expect(day.body.jobs.length).toBeGreaterThan(0)

    expect(
      (
        await petra.get(
          `/technicians/${technicianId('alarmko', USERS.petra)}/schedule?date=${today()}`,
        )
      ).status,
    ).toBe(200)
    expect(
      (
        await petra.get(
          `/technicians/${technicianId('alarmko', USERS.ivan)}/schedule?date=${today()}`,
        )
      ).status,
    ).toBe(403)
  })
})

describe('office roles', () => {
  it('/me/jobs is for technicians only', async () => {
    const dispatcher = await loginAs(USERS.alarmkoDispatcher)
    expect((await dispatcher.get(`/me/jobs?date=${today()}`)).status).toBe(403)
  })

  it('dispatchers can read members but owner-only endpoints are 403', async () => {
    const dispatcher = await loginAs(USERS.alarmkoDispatcher)
    const t = tenantBySlug('alarmko')
    expect((await dispatcher.get('/users')).status).toBe(200)
    expect((await dispatcher.put('/tenant', { ...t.tenant })).status).toBe(403)
    const someone = getDb().users.find((u) => u.email === USERS.luka)?.id ?? ''
    expect(
      (await dispatcher.put(`/users/${someone}`, { role: 'dispatcher', isActive: true })).status,
    ).toBe(403)
  })

  it('owners can update the tenant (validated) and members', async () => {
    const owner = await loginAs(USERS.alarmkoOwner)
    const t = tenantBySlug('alarmko')
    const update = {
      name: t.tenant.name,
      locale: t.tenant.locale,
      timezone: 'America/New_York',
      currency: 'USD',
      settings: { ...t.tenant.settings, requireSignature: false },
    }
    const updated = await owner.put<{ timezone: string }>('/tenant', update)
    expect(updated.status).toBe(200)
    expect(updated.body.timezone).toBe('America/New_York')

    expect((await owner.put('/tenant', { ...update, timezone: 'Mars/Olympus' })).status).toBe(400)
    expect(
      (await owner.put('/tenant', { ...update, settings: { unknownSetting: true } })).status,
    ).toBe(400)

    const luka = getDb().users.find((u) => u.email === USERS.luka)?.id ?? ''
    expect(
      (await owner.put(`/users/${luka}`, { role: 'technician', isActive: false })).status,
    ).toBe(200)
  })

  it('an owner cannot remove the last active owner (409)', async () => {
    const owner = await loginAs(USERS.alarmkoOwner)
    const me = getDb().users.find((u) => u.email === USERS.alarmkoOwner)?.id ?? ''
    const response = await owner.put<ProblemDetails>(`/users/${me}`, {
      role: 'dispatcher',
      isActive: true,
    })
    expect(response.status).toBe(409)
    expect(response.body.code).toBe('member.last_owner')
  })
})
