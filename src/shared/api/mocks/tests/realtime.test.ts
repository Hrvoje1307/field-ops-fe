import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { startHub, type HubEvent } from '@/shared/api/realtime/hub'
import { env } from '@/shared/config/env'

import { resetMockDb } from '../db'
import { broadcast, dropConnections, openConnections } from '../lib/realtime'
import { loginAs, tenantBySlug, technicianId, USERS, type Session } from './client'

beforeEach(() => {
  resetMockDb()
})

afterEach(async () => {
  dropConnections()
  await until(() => openConnections() === 0)
})

const until = async (check: () => boolean, timeout = 3000) => {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error('not yet')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

async function listen(session: Session) {
  const events: HubEvent[] = []
  let connected = false
  const hub = startHub({
    url: env.hubUrl,
    getAccessToken: () => session.tokens.accessToken,
    onEvent: (event) => events.push(event),
    onStatus: (status) => {
      if (status === 'connected') connected = true
    },
    retryDelay: () => 20,
  })
  await until(() => connected)
  return { hub, events }
}

/** A job of the tenant that is still new, to be changed by someone. */
function newJobId(slug = 'alarmko'): string {
  const job = tenantBySlug(slug).jobs.find((j) => j.status === 'new')
  if (!job) throw new Error('Seed needs a new job')
  return job.id
}

const cancel = (session: Session, jobId: string) =>
  session.post(`/jobs/${jobId}/transition`, { to: 'cancelled', note: 'Test' })

describe('the mock hub', () => {
  it('refuses a connection that negotiates without a valid token', async () => {
    const response = await fetch(`${env.hubUrl}/negotiate?negotiateVersion=1`, { method: 'POST' })
    expect(response.status).toBe(401)
  })

  it('tells the whole office of a change, and nobody of another tenant', async () => {
    const dispatcher = await loginAs(USERS.alarmkoDispatcher)
    const owner = await loginAs(USERS.alarmkoOwner)
    const bura = await loginAs(USERS.buraOwner)
    const a = await listen(owner)
    const b = await listen(bura)
    const jobId = newJobId()
    await cancel(dispatcher, jobId)

    await until(() => a.events.length >= 2)
    expect(a.events.map((e) => e.type)).toEqual(['JobUpdated', 'JobStatusChanged'])
    // Bura's owner is connected and hears nothing of it
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(b.events).toEqual([])
    await a.hub.stop()
    await b.hub.stop()
  })

  it('a technician hears of their own jobs and published plans, not of the others’', async () => {
    const dispatcher = await loginAs(USERS.alarmkoDispatcher)
    const ivan = await loginAs(USERS.ivan)
    const petra = await loginAs(USERS.petra)
    const t = tenantBySlug('alarmko')
    const ivanId = technicianId('alarmko', USERS.ivan)

    // A job of Ivan's that can still be cancelled
    const ivansJob = t.jobs.find(
      (j) =>
        j.status === 'scheduled' &&
        t.assignments.some(
          (assignment) => assignment.jobId === j.id && assignment.technicianId === ivanId,
        ),
    )
    if (!ivansJob) throw new Error('Seed needs a scheduled job for Ivan')
    const forIvan = await listen(ivan)
    const forPetra = await listen(petra)
    await cancel(dispatcher, ivansJob.id)
    await until(() => forIvan.events.length >= 1)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(forIvan.events[0]).toMatchObject({ type: 'JobUpdated', payload: { jobId: ivansJob.id } })
    expect(forPetra.events).toEqual([])

    // A published plan goes to everyone in the tenant
    broadcast(t.tenant.id, [
      {
        target: 'RoutePlanPublished',
        payload: { routePlanId: '00000000-0000-4000-8000-000000000001', date: '2026-10-16' },
        technicianIds: 'all',
      },
    ])
    await until(() => forPetra.events.length >= 1)
    expect(forPetra.events[0]?.type).toBe('RoutePlanPublished')
    expect(forIvan.events.at(-1)?.type).toBe('RoutePlanPublished')
    await forIvan.hub.stop()
    await forPetra.hub.stop()
  })
})
