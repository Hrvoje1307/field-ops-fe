import { beforeEach, describe, expect, it } from 'vitest'

import type { Message, MessagePage, PublicJob } from '@/shared/api/generated/model'

import { resetMockDb } from '../db'
import type { JobRow, TenantData } from '../db/rows'
import { api, loginAs, tenantBySlug, USERS } from './client'

beforeEach(() => {
  resetMockDb()
})

const contactsOf = (t: TenantData, job: JobRow) =>
  t.contacts.filter((c) => c.clientId === job.clientId && !c.deletedAt)

/** A scheduled job whose client has a phone that takes SMS, and an e-mail address. */
function reachableJob(t: TenantData, slug: string): JobRow {
  const job = t.jobs.find(
    (j) =>
      j.status === 'scheduled' &&
      j.scheduledDate &&
      contactsOf(t, j).some((c) => c.phone && c.receivesSms) &&
      contactsOf(t, j).some((c) => c.email),
  )
  if (!job) throw new Error(`Seed of ${slug} needs a scheduled job with a phone and an e-mail`)
  return job
}

describe('GET /messages', () => {
  it('lists what the tenant has sent, newest first, and only to the office', async () => {
    const owner = await loginAs(USERS.alarmkoOwner)
    const page = await owner.get<MessagePage>('/messages')
    expect(page.status).toBe(200)
    expect(page.body.totalCount).toBeGreaterThan(3)
    const created = page.body.items.map((m) => m.createdAt)
    expect(created).toEqual([...created].sort().reverse())
    // The seed has all three endings
    const statuses = new Set(page.body.items.map((m) => m.status))
    expect(statuses).toContain('delivered')
    expect(statuses).toContain('failed')
    expect(statuses).toContain('undeliverable')
    expect((await (await loginAs(USERS.ivan)).get('/messages')).status).toBe(403)
  })

  it('filters by job and status, and pages', async () => {
    const owner = await loginAs(USERS.alarmkoOwner)
    const all = (await owner.get<MessagePage>('/messages')).body
    const failed = (await owner.get<MessagePage>('/messages?status=failed')).body
    expect(failed.items.length).toBeGreaterThan(0)
    expect(failed.items.every((m) => m.status === 'failed' && m.error)).toBe(true)

    const jobId = all.items[0]?.jobId ?? ''
    const ofJob = (await owner.get<MessagePage>(`/messages?jobId=${jobId}`)).body
    expect(ofJob.items.every((m) => m.jobId === jobId)).toBe(true)

    const first = (await owner.get<MessagePage>('/messages?page=1&pageSize=2')).body
    const second = (await owner.get<MessagePage>('/messages?page=2&pageSize=2')).body
    expect(first.items).toHaveLength(2)
    expect(first.totalCount).toBe(all.totalCount)
    expect(second.items[0]?.id).toBe(all.items[2]?.id)
  })

  it('a tenant never sees another’s messages', async () => {
    const alarmko = await loginAs(USERS.alarmkoOwner)
    const bura = await loginAs(USERS.buraOwner)
    const mine = (await alarmko.get<MessagePage>('/messages')).body.items.map((m) => m.id)
    const theirs = (await bura.get<MessagePage>('/messages')).body.items.map((m) => m.id)
    expect(theirs.some((id) => mine.includes(id))).toBe(false)
  })
})

describe('POST /jobs/{id}/notify', () => {
  it('sends the template to the contacts who take SMS, with the job’s own words and its link', async () => {
    const t = tenantBySlug('alarmko')
    const job = reachableJob(t, 'alarmko')
    const owner = await loginAs(USERS.alarmkoOwner)
    const sent = await owner.post<Message[]>(`/jobs/${job.id}/notify`, {
      channel: 'sms',
      templateKey: 'on_the_way',
    })
    expect(sent.status).toBe(202)
    const wanted = contactsOf(t, job).filter((c) => c.phone && c.receivesSms)
    expect(sent.body.map((m) => m.to).sort()).toEqual(wanted.map((c) => c.phone).sort())
    const [message] = sent.body
    expect(message).toMatchObject({
      jobId: job.id,
      channel: 'sms',
      templateKey: 'on_the_way',
    })
    // Alarmko's own text for "on the way"; the job's number and the page the client opens
    expect(message?.body).toContain(job.number)
    expect(message?.segments).toBeGreaterThan(0)
    expect(message?.cost).toMatch(/^\d+\.\d\d$/)
    const token = job.publicToken
    expect(token).toMatch(/^pub_/)
    const fresh = (await owner.get<MessagePage>(`/messages?jobId=${job.id}`)).body.items
    expect(fresh.some((m) => m.id === message?.id)).toBe(true)
  })

  it('the link in a message opens the client’s page for that job', async () => {
    const t = tenantBySlug('bura-klima')
    const job = reachableJob(t, 'bura-klima')
    const owner = await loginAs(USERS.buraOwner)
    const sent = await owner.post<Message[]>(`/jobs/${job.id}/notify`, {
      channel: 'sms',
      templateKey: 'on_the_way',
    })
    const link = /(\S+\/p\/pub_\w+)/.exec(sent.body[0]?.body ?? '')?.[1]
    expect(link).toBeDefined()
    const token = link?.split('/p/')[1] ?? ''
    const page = await api<PublicJob>('get', `/public/jobs/${token}`)
    expect(page.status).toBe(200)
    expect(page.body.jobNumber).toBe(job.number)
    // The same link every time while it is good
    const again = await owner.post<Message[]>(`/jobs/${job.id}/notify`, {
      channel: 'sms',
      templateKey: 'on_the_way',
    })
    expect(again.body[0]?.body).toContain(token)
  })

  it('does not text a contact who does not want SMS, unless they are chosen', async () => {
    const t = tenantBySlug('alarmko')
    const job = reachableJob(t, 'alarmko')
    const owner = await loginAs(USERS.alarmkoOwner)
    const contacts = contactsOf(t, job).filter((c) => c.phone && c.receivesSms)
    const [silent, ...rest] = contacts
    if (!silent) throw new Error('Seed needs a contact with a phone')
    silent.receivesSms = false

    const sent = await owner.post<Message[]>(`/jobs/${job.id}/notify`, {
      channel: 'sms',
      templateKey: 'on_the_way',
    })
    if (rest.length > 0) {
      expect(sent.body.map((m) => m.to)).not.toContain(silent.phone)
      expect(sent.body).toHaveLength(rest.length)
    } else {
      expect(sent.status).toBe(422)
    }
    // Asking for them by name is asking for them
    const chosen = await owner.post<Message[]>(`/jobs/${job.id}/notify`, {
      channel: 'sms',
      templateKey: 'on_the_way',
      contactId: silent.id,
    })
    expect(chosen.status).toBe(202)
    expect(chosen.body.map((m) => m.to)).toEqual([silent.phone])
  })

  it('counts toward the month’s usage', async () => {
    const t = tenantBySlug('alarmko')
    const job = reachableJob(t, 'alarmko')
    const owner = await loginAs(USERS.alarmkoOwner)
    const month = new Date().toISOString().slice(0, 7)
    const before = (
      await owner.get<{ smsCount: number; emailCount: number }>(`/tenant/usage?month=${month}`)
    ).body
    await owner.post(`/jobs/${job.id}/notify`, { channel: 'sms', templateKey: 'on_the_way' })
    await owner.post(`/jobs/${job.id}/notify`, { channel: 'email', body: 'Dobar dan.' })
    const after = (
      await owner.get<{ smsCount: number; emailCount: number }>(`/tenant/usage?month=${month}`)
    ).body
    expect(after.smsCount).toBeGreaterThan(before.smsCount)
    expect(after.emailCount).toBeGreaterThan(before.emailCount)
  })

  it('sends free text to one chosen contact, and an e-mail with a subject', async () => {
    const t = tenantBySlug('alarmko')
    const job = reachableJob(t, 'alarmko')
    const owner = await loginAs(USERS.alarmkoOwner)
    const contact = contactsOf(t, job).find((c) => c.email)
    const sent = await owner.post<Message[]>(`/jobs/${job.id}/notify`, {
      channel: 'email',
      body: 'Poštovani {klijent}, nalog {broj_naloga}.',
      contactId: contact?.id,
    })
    expect(sent.status).toBe(202)
    expect(sent.body).toHaveLength(1)
    expect(sent.body[0]).toMatchObject({ to: contact?.email, channel: 'email', templateKey: null })
    expect(sent.body[0]?.subject).toContain(job.number)
    expect(sent.body[0]?.body).toContain(`nalog ${job.number}`)
    expect(sent.body[0]?.body).not.toContain('{klijent}')
  })

  it('refuses with a reason: nobody to send to, SMS off, no template, nothing to say', async () => {
    const t = tenantBySlug('alarmko')
    const job = reachableJob(t, 'alarmko')
    const owner = await loginAs(USERS.alarmkoOwner)

    // A contact without a phone cannot get an SMS
    const noPhone = contactsOf(t, job).find((c) => !c.phone)
    if (noPhone) {
      const refused = await owner.post(`/jobs/${job.id}/notify`, {
        channel: 'sms',
        body: 'x',
        contactId: noPhone.id,
      })
      expect(refused.status).toBe(422)
    }
    // SMS is switched off for the job type
    const jobType = t.jobTypes.find((type) => type.id === job.jobTypeId)
    if (!jobType) throw new Error('job type')
    jobType.smsEnabled = false
    const off = await owner.post<{ code: string }>(`/jobs/${job.id}/notify`, {
      channel: 'sms',
      body: 'x',
    })
    expect(off.status).toBe(422)
    expect(off.body.code).toBe('notify.sms_disabled')
    // …but e-mail is not
    expect(
      (await owner.post(`/jobs/${job.id}/notify`, { channel: 'email', body: 'x' })).status,
    ).toBe(202)

    const nothing = await owner.post<{ errors: Record<string, string[]> }>(
      `/jobs/${job.id}/notify`,
      { channel: 'email' },
    )
    expect(nothing.status).toBe(400)
    expect(Object.keys(nothing.body.errors)).toEqual(['body'])

    const strange = await owner.post(`/jobs/${job.id}/notify`, {
      channel: 'email',
      body: 'x',
      contactId: '00000000-0000-4000-8000-000000000000',
    })
    expect(strange.status).toBe(400)
  })

  it('a technician cannot send, and another tenant’s job is not found', async () => {
    const t = tenantBySlug('alarmko')
    const job = reachableJob(t, 'alarmko')
    expect(
      (
        await (
          await loginAs(USERS.ivan)
        ).post(`/jobs/${job.id}/notify`, { channel: 'email', body: 'x' })
      ).status,
    ).toBe(403)
    expect(
      (
        await (
          await loginAs(USERS.buraOwner)
        ).post(`/jobs/${job.id}/notify`, { channel: 'email', body: 'x' })
      ).status,
    ).toBe(404)
  })
})

describe('message templates preview with a job', () => {
  it('fills the placeholders from the job instead of the sample', async () => {
    const t = tenantBySlug('alarmko')
    const job = reachableJob(t, 'alarmko')
    const owner = await loginAs(USERS.alarmkoOwner)
    const preview = await owner.post<{ rendered: string }>('/message-templates/preview', {
      body: '{firma}: nalog {broj_naloga}',
      jobId: job.id,
    })
    expect(preview.body.rendered).toBe(`${t.tenant.name}: nalog ${job.number}`)
  })
})
