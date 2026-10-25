import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { HistoryRow } from '../db/rows'
import type {
  Job,
  JobSummaryPage,
  Message,
  ProblemDetails,
  PublicJob,
} from '@/shared/api/generated/model'
import { startHub, type HubEvent } from '@/shared/api/realtime/hub'
import { env } from '@/shared/config/env'

import { resetMockDb } from '../db'
import { dropConnections, openConnections } from '../lib/realtime'
import { api, loginAs, tenantBySlug, USERS } from './client'

beforeEach(() => {
  resetMockDb()
})

const until = async (check: () => boolean, timeout = 3000) => {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error('not yet')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

afterEach(async () => {
  dropConnections()
  await until(() => openConnections() === 0)
})

/** A job of Alarmko with a time agreed: sends it a message so it has a link, and returns the link's token. */
async function linkFor(status: 'scheduled' | 'confirmed' = 'scheduled') {
  const t = tenantBySlug('alarmko')
  const job = t.jobs.find(
    (j) =>
      j.status === status &&
      j.scheduledDate &&
      j.scheduledStart &&
      !j.rescheduleRequestedAt &&
      t.contacts.some((c) => c.clientId === j.clientId && c.phone && c.receivesSms),
  )
  if (!job) throw new Error(`Seed needs a ${status} job with a time`)
  const owner = await loginAs(USERS.alarmkoOwner)
  const sent = await owner.post<Message[]>(`/jobs/${job.id}/notify`, {
    channel: 'sms',
    templateKey: 'on_the_way',
  })
  expect(sent.status).toBe(202)
  return { t, job, owner, token: job.publicToken ?? '' }
}

const get = (token: string) => api<PublicJob>('get', `/public/jobs/${token}`)
const confirm = (token: string) => api<PublicJob>('post', `/public/jobs/${token}/confirm`)
const reschedule = (token: string, body: object = {}) =>
  api<PublicJob>('post', `/public/jobs/${token}/reschedule-request`, { body })

describe('GET /public/jobs/{token}', () => {
  it('shows the client what they need, without signing in', async () => {
    const { t, job, token } = await linkFor()
    const page = await get(token)
    expect(page.status).toBe(200)
    expect(page.body).toMatchObject({
      jobNumber: job.number,
      status: 'scheduled',
      canConfirm: true,
      canRequestReschedule: true,
      scheduledDate: job.scheduledDate,
      company: { name: t.tenant.name },
    })
    // Only the street, an arrival window of two hours, the client by first name
    expect(page.body.addressShort).not.toContain(',')
    expect(page.body.arrivalWindowStart).toMatch(/^\d\d:\d\d$/)
    expect(page.body.arrivalWindowEnd).toMatch(/^\d\d:\d\d$/)
    expect(page.body.clientFirstName).toBeTruthy()
    expect(page.body.clientFirstName).not.toContain(' ')
  })

  it('knows nothing of a link that does not exist (404) or one that has run out (410)', async () => {
    expect((await get('pub_nothing')).status).toBe(404)
    const { job, token } = await linkFor()
    job.publicTokenExpiresAt = new Date(Date.now() - 1000).toISOString()
    const expired = await get(token)
    expect(expired.status).toBe(410)
    expect(
      await api<ProblemDetails>('post', `/public/jobs/${token}/confirm`).then((r) => r.status),
    ).toBe(410)
  })

  it('a link is good for as long as the tenant says', async () => {
    const { t, job } = await linkFor()
    const hours = t.tenant.settings.publicLinkValidityHours ?? 72
    const left = Date.parse(job.publicTokenExpiresAt ?? '') - Date.now()
    expect(Math.abs(left - hours * 3_600_000)).toBeLessThan(5000)
  })

  it('says what became of the job: under way, done, cancelled', async () => {
    const { job, token } = await linkFor()
    for (const [status, shown, confirmable] of [
      ['en_route', 'en_route', false],
      ['completed', 'done', false],
      ['cancelled', 'cancelled', false],
    ] as const) {
      job.status = status
      const page = await get(token)
      expect(page.body.status).toBe(shown)
      expect(page.body.canConfirm).toBe(confirmable)
      expect(page.body.canRequestReschedule).toBe(false)
    }
  })
})

describe('POST /public/jobs/{token}/confirm', () => {
  it('confirms the job, once and again, and the office sees who did it', async () => {
    const { t, job, owner, token } = await linkFor()
    const first = await confirm(token)
    expect(first.status).toBe(200)
    expect(first.body).toMatchObject({ status: 'confirmed', canConfirm: false })
    expect(job.status).toBe('confirmed')

    // Idempotent
    const again = await confirm(token)
    expect(again.status).toBe(200)
    expect(again.body.status).toBe('confirmed')
    const entries = t.history.filter(
      (h: HistoryRow) => h.jobId === job.id && h.toStatus === 'confirmed',
    )
    expect(entries.filter((h) => h.actor === 'client')).toHaveLength(1)

    const seen = await owner.get<Job>(`/jobs/${job.id}`)
    expect(seen.body.status).toBe('confirmed')
  })

  it('cannot confirm what is not waiting for it (409)', async () => {
    const { job, token } = await linkFor()
    job.status = 'en_route'
    const refused = await api<ProblemDetails>('post', `/public/jobs/${token}/confirm`)
    expect(refused.status).toBe(409)
    expect(refused.body.code).toBe('public.not_confirmable')
  })

  it('the office hears of it at once', async () => {
    const { owner, token } = await linkFor()
    const events: HubEvent[] = []
    let up = false
    const hub = startHub({
      url: env.hubUrl,
      getAccessToken: () => owner.tokens.accessToken,
      onEvent: (event) => events.push(event),
      onStatus: (status) => {
        up = up || status === 'connected'
      },
      retryDelay: () => 20,
    })
    await until(() => up)
    await confirm(token)
    await until(() => events.length >= 2)
    expect(events.map((e) => e.type)).toEqual(['JobUpdated', 'JobStatusChanged'])
    expect(events[1]?.payload).toMatchObject({ from: 'scheduled', to: 'confirmed' })
    await hub.stop()
  })
})

describe('POST /public/jobs/{token}/reschedule-request', () => {
  it('records the note and the dates on the job, and tells the client it is asked', async () => {
    const { job, owner, token } = await linkFor()
    const asked = await reschedule(token, {
      note: 'Molim poslije podne.',
      preferredDates: ['2026-11-03', '2026-11-04'],
    })
    expect(asked.status).toBe(202)
    expect(asked.body).toMatchObject({
      status: 'reschedule_requested',
      canConfirm: false,
      canRequestReschedule: false,
    })
    const seen = (await owner.get<Job>(`/jobs/${job.id}`)).body
    expect(seen.rescheduleNote).toContain('Molim poslije podne.')
    expect(seen.rescheduleNote).toContain('2026-11-03, 2026-11-04')
    expect(seen.rescheduleRequested).toBe(true)
  })

  it('works with nothing but a request, and only once', async () => {
    const { token } = await linkFor('confirmed')
    expect((await reschedule(token)).status).toBe(202)
    expect((await reschedule(token, { note: 'Još jednom' })).status).toBe(410)
  })

  it('takes at most three dates and 500 characters', async () => {
    const { token } = await linkFor()
    expect(
      (
        await reschedule(token, {
          preferredDates: ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'],
        })
      ).status,
    ).toBe(400)
    expect((await reschedule(token, { note: 'x'.repeat(501) })).status).toBe(400)
  })
})

describe('jobs list stays the office’s', () => {
  it('the public page needs no token and the office list still needs one', async () => {
    expect((await api<JobSummaryPage>('get', '/jobs')).status).toBe(401)
  })
})
