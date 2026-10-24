import { beforeEach, describe, expect, it } from 'vitest'

import type { Job, ProblemDetails, StatusHistoryEntry } from '@/shared/api/generated/model'

import { resetMockDb } from '../db'
import { clientId, jobId, loginAs, tenantBySlug, USERS } from './client'

beforeEach(() => {
  resetMockDb()
})

function newJobBody(title: string) {
  const t = tenantBySlug('alarmko')
  const client = clientId('alarmko', 'Ana Čulić')
  return {
    clientId: client,
    locationId: t.locations.find((l) => l.clientId === client)?.id,
    jobTypeId: t.jobTypes.find((jt) => jt.name === 'Popravak')?.id,
    title,
  }
}

describe('Idempotency-Key', () => {
  it('a replay with the same body returns the stored response and creates nothing new', async () => {
    const s = await loginAs(USERS.alarmkoDispatcher)
    const headers = { 'Idempotency-Key': 'create-job-0001' }
    const before = tenantBySlug('alarmko').jobs.length

    const first = await s.post<Job>('/jobs', newJobBody('Ne radi tipkovnica'), { headers })
    const replay = await s.post<Job>('/jobs', newJobBody('Ne radi tipkovnica'), { headers })

    expect(first.status).toBe(201)
    expect(replay.status).toBe(201)
    expect(replay.body.id).toBe(first.body.id)
    expect(replay.body.number).toBe(first.body.number)
    expect(replay.headers.get('Idempotent-Replayed')).toBe('true')
    expect(tenantBySlug('alarmko').jobs.length).toBe(before + 1)
  })

  it('the same key with a different body is a 422', async () => {
    const s = await loginAs(USERS.alarmkoDispatcher)
    const headers = { 'Idempotency-Key': 'create-job-0002' }
    await s.post('/jobs', newJobBody('Prvi'), { headers })
    const reused = await s.post<ProblemDetails>('/jobs', newJobBody('Drugi'), { headers })
    expect(reused.status).toBe(422)
    expect(reused.body.code).toBe('idempotency.key_reused')
  })

  it('a replayed transition is applied once (weak signal, double tap)', async () => {
    const petra = await loginAs(USERS.petra)
    const id = jobId('alarmko', 'Godišnji servis', 'Tomislav Đurđević')
    const headers = { 'Idempotency-Key': 'arrive-at-site-01' }

    const first = await petra.post<Job>(`/jobs/${id}/transition`, { to: 'on_site' }, { headers })
    const replay = await petra.post<Job>(`/jobs/${id}/transition`, { to: 'on_site' }, { headers })
    expect(first.status).toBe(200)
    expect(replay.status).toBe(200)
    expect(replay.body.version).toBe(first.body.version)

    const history = (await petra.get<StatusHistoryEntry[]>(`/jobs/${id}/history`)).body
    expect(history.filter((h) => h.toStatus === 'on_site')).toHaveLength(1)
  })

  it('replays stored errors too', async () => {
    const s = await loginAs(USERS.alarmkoDispatcher)
    const headers = { 'Idempotency-Key': 'bad-transition-1' }
    const id = jobId('alarmko', 'Sirena se oglašava bez razloga')
    expect((await s.post(`/jobs/${id}/transition`, { to: 'en_route' }, { headers })).status).toBe(
      409,
    )
    expect((await s.post(`/jobs/${id}/transition`, { to: 'en_route' }, { headers })).status).toBe(
      409,
    )
  })

  it('keys are scoped per user', async () => {
    const ivana = await loginAs(USERS.alarmkoDispatcher)
    const owner = await loginAs(USERS.alarmkoOwner)
    const headers = { 'Idempotency-Key': 'shared-key-0001' }
    const a = await ivana.post<Job>('/jobs', newJobBody('Isti ključ'), { headers })
    const b = await owner.post<Job>('/jobs', newJobBody('Isti ključ'), { headers })
    expect(a.body.id).not.toBe(b.body.id)
  })

  it('rejects malformed keys (8–128 characters)', async () => {
    const s = await loginAs(USERS.alarmkoDispatcher)
    const response = await s.post('/jobs', newJobBody('Kratki ključ'), {
      headers: { 'Idempotency-Key': 'short' },
    })
    expect(response.status).toBe(400)
  })
})
