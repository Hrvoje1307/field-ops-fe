import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  Attachment,
  Draft,
  ExclusionRule,
  Mailbox,
  MailThread,
  MailThreadSummary,
  MailThreadSummaryPage,
} from '@/shared/api/generated/model'

import { resetMockDb } from '../db'
import { MOCK_AI_MONTHLY_LIMIT } from '../lib/sales/const'
import { loginAs, USERS } from './client'
import { alarmko, bura, expectProblem, letAiFinish, threadRow } from './sales-helpers'

beforeEach(() => {
  resetMockDb()
})

const owner = () => loginAs(USERS.alarmkoOwner)
const IMAP = {
  emailAddress: 'prodaja@alarmko.test',
  displayName: 'Prodaja',
  kind: 'shared',
  imapHost: 'imap.example.test',
  imapPort: 993,
  imapSecurity: 'ssl',
  smtpHost: 'smtp.example.test',
  smtpPort: 587,
  smtpSecurity: 'starttls',
  username: 'prodaja@alarmko.test',
  password: 'app-password',
} as const

describe('mailboxes', () => {
  it('connects IMAP: 201 without the password; the same address again is 409 sales.mailbox_exists', async () => {
    const session = await owner()
    const created = await session.post<Mailbox & { password?: string }>(
      '/sales/mailboxes/imap',
      IMAP,
    )
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      provider: 'imap',
      status: 'active',
      kind: 'shared',
      canSend: true,
    })
    expect(created.body).not.toHaveProperty('password')
    expectProblem(await session.post('/sales/mailboxes/imap', IMAP), 409, 'sales.mailbox_exists')
  })

  it('a failed connection test is 422 with the code of the failing side and a detail', async () => {
    const session = await owner()
    const imap = expectProblem(
      await session.post('/sales/mailboxes/imap', { ...IMAP, imapHost: 'imap.nowhere.invalid' }),
      422,
      'mailbox.imap_failed',
    )
    expect(imap.detail).toContain('imap.nowhere.invalid')
    expectProblem(
      await session.post('/sales/mailboxes/imap', { ...IMAP, password: 'wrong' }),
      422,
      'mailbox.imap_failed',
    )
    expectProblem(
      await session.post('/sales/mailboxes/imap', { ...IMAP, smtpHost: 'smtp.nowhere.invalid' }),
      422,
      'mailbox.smtp_failed',
    )
    // Nothing was saved
    expect((await session.get<Mailbox[]>('/sales/mailboxes')).body).toHaveLength(2)
  })

  it('a personal mailbox needs an owner from the tenant (the caller by default); 400 otherwise', async () => {
    const session = await owner()
    const mine = await session.post<Mailbox>('/sales/mailboxes/imap', { ...IMAP, kind: 'personal' })
    expect(mine.body.owner?.fullName).toBe('Marko Kovač')
    const bad = await session.post<{ errors: Record<string, string[]> }>('/sales/mailboxes/imap', {
      ...IMAP,
      emailAddress: 'x@alarmko.test',
      kind: 'personal',
      ownerUserId: '01a19199-635f-7348-9092-dda88b060f77',
    })
    expect(bad.status).toBe(400)
    expect(bad.body.errors).toHaveProperty('ownerUserId')
  })

  it('renames, pauses and resumes; a paused mailbox is disabled, and cannot be synced into needs_reauth', async () => {
    const session = await owner()
    const shared = alarmko().sales.mailboxes.find((m) => m.kind === 'shared')
    if (!shared) throw new Error('seed')
    const paused = await session.put<Mailbox>(`/sales/mailboxes/${shared.id}`, {
      displayName: 'Info (pauza)',
      kind: 'shared',
      isActive: false,
    })
    expect(paused.body).toMatchObject({ displayName: 'Info (pauza)', status: 'disabled' })
    const resumed = await session.put<Mailbox>(`/sales/mailboxes/${shared.id}`, {
      displayName: 'Info',
      kind: 'shared',
      isActive: true,
    })
    expect(resumed.body.status).toBe('active')
    expect(
      (
        await session.put('/sales/mailboxes/01a19199-635f-7348-9092-dda88b060f77', {
          displayName: 'x',
          kind: 'shared',
          isActive: true,
        })
      ).status,
    ).toBe(404)
  })

  it('syncs: 202; a mailbox that needs to be connected again is 409 sales.mailbox_needs_reauth', async () => {
    const session = await owner()
    const shared = alarmko().sales.mailboxes.find((m) => m.kind === 'shared')
    if (!shared) throw new Error('seed')
    const before = shared.lastSyncedAt
    vi.setSystemTime(new Date(Date.now() + 60_000))
    expect((await session.post(`/sales/mailboxes/${shared.id}/sync`)).status).toBe(202)
    expect(shared.lastSyncedAt).not.toBe(before)
    shared.status = 'needs_reauth'
    expectProblem(
      await session.post(`/sales/mailboxes/${shared.id}/sync`),
      409,
      'sales.mailbox_needs_reauth',
    )
  })

  it('disconnects: without purge the history stays, with purge the conversations that only it held go', async () => {
    const session = await owner()
    const ivana = alarmko().sales.mailboxes.find((m) => m.kind === 'personal')
    const shared = alarmko().sales.mailboxes.find((m) => m.kind === 'shared')
    if (!ivana || !shared) throw new Error('seed')
    const privateThread = threadRow(alarmko(), 'Jeste li stigli pogledati?')
    const dual = threadRow(alarmko(), 'Kontrola pristupa, 2. kat')

    expect((await session.del(`/sales/mailboxes/${ivana.id}`, {})).status).toBe(204)
    expect((await session.get<Mailbox[]>('/sales/mailboxes')).body.map((m) => m.id)).toEqual([
      shared.id,
    ])
    expect((await session.get(`/sales/threads/${privateThread.id}`)).status).toBe(200)

    resetMockDb()
    const again = await owner()
    const ivana2 = alarmko().sales.mailboxes.find((m) => m.kind === 'personal')
    expect((await again.del(`/sales/mailboxes/${ivana2?.id ?? ''}?purge=true`)).status).toBe(204)
    expect(
      (await again.get(`/sales/threads/${threadRow(alarmko(), 'Jeste li stigli pogledati?').id}`))
        .status,
    ).toBe(404)
    // The conversation shared with info@ stays, without Ivana's reply
    const kept = (await again.get<MailThread>(`/sales/threads/${dual.id}`)).body
    expect(kept.messages.every((m) => m.direction === 'inbound')).toBe(true)
  })

  it('OAuth: start gives the provider URL; the callback redirects to the mailboxes page with ?connected=', async () => {
    const session = await owner()
    const start = await session.post<{ authorizeUrl: string }>('/sales/mailboxes/oauth/start', {
      provider: 'gmail',
      kind: 'personal',
    })
    expect(start.status).toBe(200)
    const state = new URL(start.body.authorizeUrl).searchParams.get('state') ?? ''
    expect(state).not.toBe('')
    const callback = (query: string) =>
      fetch(`http://localhost/api/v1/sales/mailboxes/oauth/callback?${query}`, {
        redirect: 'manual',
      })

    const response = await callback(
      `state=${encodeURIComponent(state)}&code=mock:marko.kovac@gmail.test`,
    )
    expect(response.status).toBe(302)
    const location = new URL(response.headers.get('Location') ?? '')
    expect(location.pathname).toBe('/sales/settings/mailboxes')
    const connected = location.searchParams.get('connected')
    const list = (await session.get<Mailbox[]>('/sales/mailboxes')).body
    expect(list.find((m) => m.id === connected)).toMatchObject({
      provider: 'gmail',
      kind: 'personal',
      status: 'active',
      emailAddress: 'marko.kovac@gmail.test',
    })
    // A state is used once
    const again = await callback(`state=${encodeURIComponent(state)}&code=mock:x@y.test`)
    expect(new URL(again.headers.get('Location') ?? '').searchParams.get('error')).toBe(
      'provider_error',
    )
  })

  it('OAuth errors come back as ?error=: access_denied, already_connected, wrong_account, provider_error', async () => {
    const session = await owner()
    const callback = async (body: object, query: (state: string) => string) => {
      const start = await session.post<{ authorizeUrl: string }>(
        '/sales/mailboxes/oauth/start',
        body,
      )
      const state = new URL(start.body.authorizeUrl).searchParams.get('state') ?? ''
      const response = await fetch(
        `http://localhost/api/v1/sales/mailboxes/oauth/callback?${query(encodeURIComponent(state))}`,
        { redirect: 'manual' },
      )
      return new URL(response.headers.get('Location') ?? '').searchParams
    }
    expect(
      (
        await callback(
          { provider: 'gmail', kind: 'shared' },
          (s) => `state=${s}&error=access_denied`,
        )
      ).get('error'),
    ).toBe('access_denied')
    expect(
      (
        await callback(
          { provider: 'gmail', kind: 'shared' },
          (s) => `state=${s}&error=server_error`,
        )
      ).get('error'),
    ).toBe('provider_error')
    expect(
      (await callback({ provider: 'gmail', kind: 'shared' }, (s) => `state=${s}`)).get('error'),
    ).toBe('provider_error')
    expect(
      (
        await callback(
          { provider: 'gmail', kind: 'shared' },
          (s) => `state=${s}&code=mock:info@alarmko.test`,
        )
      ).get('error'),
    ).toBe('already_connected')

    // Reconnecting a mailbox that needs it: the same account works, another one is wrong_account
    const shared = alarmko().sales.mailboxes.find((m) => m.kind === 'shared')
    if (!shared) throw new Error('seed')
    shared.status = 'needs_reauth'
    shared.lastError = 'Pristup je opozvan.'
    const body = { provider: 'gmail', kind: 'shared', mailboxId: shared.id }
    expect(
      (await callback(body, (s) => `state=${s}&code=mock:other@alarmko.test`)).get('error'),
    ).toBe('wrong_account')
    expect(
      (await callback(body, (s) => `state=${s}&code=mock:info@alarmko.test`)).get('connected'),
    ).toBe(shared.id)
    expect(shared.status).toBe('active')
    expect(shared.lastError).toBeNull()
  })
})

describe('the inbox (GET /sales/threads)', () => {
  const page = async (query = '') =>
    (await (await owner()).get<MailThreadSummaryPage>(`/sales/threads?pageSize=200${query}`)).body

  it('cards are parameters: Prodaja isSales=true, Za pregled needsReview=true, Čeka odgovor awaitingReply=true', async () => {
    const all = await page()
    // Non-sales threads only with isSales=false
    expect(all.items.every((t) => t.classification?.isSales !== false)).toBe(true)
    const sales = await page('&isSales=true')
    expect(sales.items.length).toBeGreaterThan(10)
    expect(sales.items.every((t) => t.classification?.isSales === true)).toBe(true)

    const review = await page('&needsReview=true')
    expect(review.items.length).toBeGreaterThanOrEqual(4)
    expect(
      review.items.every((t) => t.needsReview && (t.classification?.confidence ?? 1) < 0.7),
    ).toBe(true)

    const waiting = await page('&awaitingReply=true')
    expect(waiting.items.every((t) => t.awaitingReply)).toBe(true)
    expect(waiting.items.length).toBeGreaterThan(3)

    const nonSales = await page('&isSales=false')
    expect(nonSales.items.length).toBeGreaterThanOrEqual(4)
    expect(
      nonSales.items.every((t) => t.classification?.isSales === false || t.classification === null),
    ).toBe(true)
  })

  it('unlinked=true: only sales threads that have no deal', async () => {
    const unlinked = await page('&unlinked=true')
    expect(unlinked.items.length).toBeGreaterThan(3)
    expect(unlinked.items.every((t) => t.deal === null && t.classification?.isSales === true)).toBe(
      true,
    )
  })

  it('filters by category (comma-separated), mailbox, deal and q; sorts and pages', async () => {
    const categories = await page('&category=quote_request,accepted')
    expect(new Set(categories.items.map((t) => t.classification?.category))).toEqual(
      new Set(['quote_request', 'accepted']),
    )
    const shared = alarmko().sales.mailboxes.find((m) => m.kind === 'shared')
    const byMailbox = await page(`&mailboxId=${shared?.id ?? ''}`)
    expect(byMailbox.items.length).toBeGreaterThan(10)
    const deal = alarmko().sales.deals.find((d) => d.title === 'Kontrola pristupa, 2. kat')
    expect((await page(`&dealId=${deal?.id ?? ''}`)).items).toHaveLength(1)
    expect((await page('&q=hotel')).items.length).toBeGreaterThan(0)
    expect((await page('&q=nepostojecirecenicazzz')).items).toHaveLength(0)

    const newest = await page()
    const dates = newest.items.map((t) => t.lastMessageAt)
    expect(dates).toEqual([...dates].sort().reverse())
    const oldest = await page('&sort=lastMessageAt')
    expect(oldest.items.map((t) => t.lastMessageAt)).toEqual([...dates].sort())
    const second = (
      await (await owner()).get<MailThreadSummaryPage>('/sales/threads?pageSize=5&page=2')
    ).body
    expect(second).toMatchObject({ page: 2, pageSize: 5, items: expect.any(Array) as unknown[] })
    expect(second.totalCount).toBe(newest.totalCount)
  })

  it('a summary carries what the inbox needs: counts, last in/out, attachments, AI result, deal, matched client', async () => {
    const row = threadRow(alarmko(), 'Upit: video nadzor za pekaru')
    const t = (await (await owner()).get<MailThread>(`/sales/threads/${row.id}`)).body
    expect(t).toMatchObject({
      messageCount: 3,
      awaitingReply: true,
      aiStatus: 'done',
      needsReview: false,
      deal: { title: 'Video nadzor za pekaru' },
      client: { name: 'Pekara Zlatno zrno d.o.o.' },
    })
    expect(t.classification).toMatchObject({ category: 'new_inquiry', source: 'ai', isSales: true })
    expect(t.lastInboundAt).toBe(t.messages[2]?.sentAt)
    expect(t.lastOutboundAt).toBe(t.messages[1]?.sentAt)
    expect(t.messages.map((m) => m.direction)).toEqual(['inbound', 'outbound', 'inbound'])
    const withFile = threadRow(alarmko(), 'Pregovori: video nadzor, hotel')
    const hotel = (await (await owner()).get<MailThread>(`/sales/threads/${withFile.id}`)).body
    expect(hotel.hasAttachments).toBe(true)
    expect(hotel.messages.at(-1)?.attachments[0]).toMatchObject({ fileName: 'troskovnik.pdf' })
  })

  it('threads in the seed: pending and failed AI, a user correction, an excluded sender', async () => {
    const find = async (subject: string) =>
      (await (await owner()).get<MailThread>(`/sales/threads/${threadRow(alarmko(), subject).id}`))
        .body
    expect((await find('Upit: nova poslovnica')).aiStatus).toBe('pending')
    expect((await find('Trebam ponudu za 4 kamere')).aiStatus).toBe('failed')
    const corrected = await find('Koliko košta ugradnja alarma u stan?')
    expect(corrected.classification).toMatchObject({ source: 'user', confidence: null })
    expect(corrected.needsReview).toBe(false)
    const excluded = (await page('&isSales=false')).items.find((t) =>
      t.subject.startsWith('Akcija do petka'),
    )
    expect(excluded).toBeDefined()
  })
})

describe('correcting, linking, excluding, saving attachments', () => {
  it('a correction is the user’s: category and sales flag, no confidence, off the review list', async () => {
    const session = await owner()
    const row = threadRow(alarmko(), 'Molim ponudu: kontrola ulaza')
    const before = (await session.get<MailThread>(`/sales/threads/${row.id}`)).body
    expect(before.needsReview).toBe(true)
    const updated = await session.put<MailThreadSummary>(
      `/sales/threads/${row.id}/classification`,
      {
        category: 'support',
        isSales: false,
      },
    )
    expect(updated.body.classification).toMatchObject({
      category: 'support',
      source: 'user',
      isSales: false,
      confidence: null,
    })
    expect(updated.body.needsReview).toBe(false)
    expect(
      alarmko()
        .sales.aiFeedback.map((f) => f.field)
        .sort(),
    ).toEqual(['category', 'is_sales'])
    // It is non-sales now: out of the default inbox
    const inbox = (await session.get<MailThreadSummaryPage>('/sales/threads?pageSize=200')).body
    expect(inbox.items.map((t) => t.id)).not.toContain(row.id)
  })

  it('links to a deal, creates a deal, unlinks; exactly one of dealId / createDeal, else 400', async () => {
    const session = await owner()
    const row = threadRow(alarmko(), 'Prihvaćamo ponudu')
    const deal = alarmko().sales.deals.find((d) => d.title === 'Video nadzor za pekaru')
    if (!deal) throw new Error('seed')

    const link = `/sales/threads/${row.id}/link`
    expect((await session.post(link, {})).status).toBe(400)
    expect((await session.post(link, { dealId: deal.id, createDeal: { title: 'x' } })).status).toBe(
      400,
    )
    expect(
      (await session.post(link, { dealId: '01a19199-635f-7348-9092-dda88b060f77' })).status,
    ).toBe(400)

    const linked = await session.post<MailThreadSummary>(link, { dealId: deal.id })
    expect(linked.body.deal).toEqual({ id: deal.id, title: deal.title })
    const activities = alarmko()
      .sales.activities.filter((a) => a.dealId === deal.id)
      .map((a) => a.type)
    expect(activities).toContain('thread_linked')

    const unlinked = await session.post<MailThreadSummary>(link, { dealId: null })
    expect(unlinked.body.deal).toBeNull()
    expect(
      alarmko().sales.activities.some((a) => a.dealId === deal.id && a.type === 'thread_unlinked'),
    ).toBe(true)

    const made = await session.post<MailThreadSummary>(link, {
      createDeal: { title: 'Ugradnja za Mariju Jurić', value: '2100.00' },
    })
    expect(made.body.deal?.title).toBe('Ugradnja za Mariju Jurić')
    const createdDeal = alarmko().sales.deals.find((d) => d.id === made.body.deal?.id)
    expect(createdDeal).toMatchObject({ value: '2100.00', source: 'email' })
  })

  it('excludes a sender: rule created (default pattern = the external sender), the conversation leaves the inbox and its bodies are purged', async () => {
    const session = await owner()
    const row = threadRow(alarmko(), 'Poziv na sajam sigurnosti')
    const rule = await session.post<ExclusionRule>(`/sales/threads/${row.id}/exclude`, {})
    expect(rule.status).toBe(201)
    expect(rule.body.pattern).toBe('sajam@sigurnost-expo.test')
    expect(row.excluded).toBe(true)
    expect(
      alarmko()
        .sales.messages.filter((m) => m.threadId === row.id)
        .every((m) => m.bodyText === null),
    ).toBe(true)
    const domain = await session.post<ExclusionRule>(
      `/sales/threads/${threadRow(alarmko(), 'Osvojite nagradu odmah').id}/exclude`,
      {
        pattern: '@PROMO-igra.test',
        purge: false,
      },
    )
    expect(domain.body.pattern).toBe('@promo-igra.test')
    expect(
      (await session.post(`/sales/threads/${row.id}/exclude`, { pattern: 'not an address' }))
        .status,
    ).toBe(400)
  })

  it('saves an attachment to the linked deal: 201; not linked is 409 thread.not_linked; the file is the deal’s', async () => {
    const session = await owner()
    const hotel = threadRow(alarmko(), 'Pregovori: video nadzor, hotel')
    const messages = (await session.get<MailThread>(`/sales/threads/${hotel.id}`)).body.messages
    const withFile = messages.find((m) => m.attachments.length > 0)
    const part = withFile?.attachments[0]
    if (!withFile || !part) throw new Error('seed')
    const saved = await session.post<Attachment>(`/sales/threads/${hotel.id}/attachments`, {
      messageId: withFile.id,
      partId: part.partId,
    })
    expect(saved.status).toBe(201)
    expect(saved.body).toMatchObject({
      ownerType: 'deal',
      ownerId: hotel.dealId,
      fileName: 'troskovnik.pdf',
    })
    // The same part again is the same file; the message knows
    const again = await session.post<Attachment>(`/sales/threads/${hotel.id}/attachments`, {
      messageId: withFile.id,
      partId: part.partId,
    })
    expect(again.body.id).toBe(saved.body.id)
    const after = (await session.get<MailThread>(`/sales/threads/${hotel.id}`)).body
    expect(
      after.messages.find((m) => m.id === withFile.id)?.attachments[0]?.savedAttachmentId,
    ).toBe(saved.body.id)
    // The generic attachments API lists it for the deal
    const listed = await session.get<Attachment[]>(
      `/attachments?ownerType=deal&ownerId=${hotel.dealId ?? ''}`,
    )
    expect(listed.body.map((a) => a.id)).toContain(saved.body.id)

    const unlinked = threadRow(alarmko(), 'Račun br. 2026-0412')
    const invoice = (await session.get<MailThread>(`/sales/threads/${unlinked.id}`)).body
      .messages[0]
    expectProblem(
      await session.post(`/sales/threads/${unlinked.id}/attachments`, {
        messageId: invoice?.id,
        partId: invoice?.attachments[0]?.partId,
      }),
      409,
      'thread.not_linked',
    )
    expect(
      (
        await session.post(`/sales/threads/${hotel.id}/attachments`, {
          messageId: withFile.id,
          partId: 'nope',
        })
      ).status,
    ).toBe(400)
  })
})

describe('AI: classify again, drafts, the allowance', () => {
  it('reprocess answers 202; the thread is pending and then done with a result', async () => {
    const session = await owner()
    const row = threadRow(alarmko(), 'Trebam ponudu za 4 kamere')
    const usageBefore = alarmko().usage.at(-1)?.aiClassifications ?? 0
    expect((await session.post(`/sales/threads/${row.id}/reprocess`)).status).toBe(202)
    expect((await session.get<MailThread>(`/sales/threads/${row.id}`)).body.aiStatus).toBe(
      'pending',
    )
    letAiFinish()
    const done = (await session.get<MailThread>(`/sales/threads/${row.id}`)).body
    expect(done.aiStatus).toBe('done')
    expect(done.classification).toMatchObject({
      category: 'quote_request',
      source: 'ai',
      model: 'mock-model',
    })
    expect(alarmko().usage.at(-1)?.aiClassifications).toBe(usageBefore + 1)
  })

  it('a result never overwrites a user’s correction', async () => {
    const session = await owner()
    const row = threadRow(alarmko(), 'Koliko košta ugradnja alarma u stan?')
    await session.post(`/sales/threads/${row.id}/reprocess`)
    letAiFinish()
    const after = (await session.get<MailThread>(`/sales/threads/${row.id}`)).body
    expect(after.classification).toMatchObject({
      category: 'quote_request',
      source: 'user',
      confidence: null,
    })
    expect(after.classification?.summary).toBeTruthy()
  })

  it('AI off in the settings or without the plan feature: 409 sales.ai_disabled (reprocess and draft)', async () => {
    const session = await owner()
    const row = threadRow(alarmko(), 'Trebam ponudu za 4 kamere')
    alarmko().sales.settings.aiEnabled = false
    expectProblem(
      await session.post(`/sales/threads/${row.id}/reprocess`),
      409,
      'sales.ai_disabled',
    )
    expectProblem(
      await session.post(`/sales/threads/${row.id}/drafts`, { kind: 'reply' }),
      409,
      'sales.ai_disabled',
    )
    alarmko().sales.settings.aiEnabled = true
    alarmko().extraFeatures = ['sales']
    expectProblem(
      await session.post(`/sales/threads/${row.id}/reprocess`),
      409,
      'sales.ai_disabled',
    )
    // Without the AI everything else still works
    expect((await session.get('/sales/board')).status).toBe(200)
    expect((await session.get<Mailbox[]>('/sales/mailboxes')).status).toBe(200)
  })

  it('the monthly allowance is used up: 429 sales.ai_quota_exceeded with Retry-After in seconds', async () => {
    const session = await owner()
    const row = threadRow(alarmko(), 'Trebam ponudu za 4 kamere')
    const usage = alarmko().usage.at(-1)
    if (!usage) throw new Error('seed')
    usage.aiClassifications = MOCK_AI_MONTHLY_LIMIT
    usage.aiDrafts = 0
    const response = await session.post(`/sales/threads/${row.id}/reprocess`)
    const problem = expectProblem(response, 429, 'sales.ai_quota_exceeded')
    expect(problem.status).toBe(429)
    const retryAfter = Number(response.headers.get('Retry-After'))
    expect(Number.isInteger(retryAfter)).toBe(true)
    expect(retryAfter).toBeGreaterThan(0)
    expect(retryAfter).toBeLessThanOrEqual(31 * 86_400)
    expectProblem(
      await session.post(`/sales/threads/${row.id}/drafts`, { kind: 'reply' }),
      429,
      'sales.ai_quota_exceeded',
    )
  })

  it('a draft is 202 "generating"; after the AI’s delay it is ready, with recipients, a signature and DraftReady', async () => {
    const session = await owner()
    const row = threadRow(alarmko(), 'Zanima me protuprovalni sustav')
    const created = await session.post<Draft>(`/sales/threads/${row.id}/drafts`, {
      kind: 'reply',
      instructions: 'Ponudi termin u utorak.',
    })
    expect(created.status).toBe(202)
    expect(created.body).toMatchObject({ status: 'generating', kind: 'reply', threadId: row.id })
    expect(created.body.to.map((a) => a.email)).toEqual(['sandra.vukovic@mail.test'])
    const usageBefore = alarmko().usage.at(-1)?.aiDrafts ?? 0
    expect(usageBefore).toBeGreaterThan(9)

    letAiFinish()
    const ready = (await session.get<Draft>(`/sales/drafts/${created.body.id}`)).body
    expect(ready.status).toBe('ready')
    expect(ready.subject).toBe('Re: Zanima me protuprovalni sustav')
    expect(ready.bodyText).toContain('Ponudi termin u utorak.')
    expect(ready.bodyText).toContain('Alarmko d.o.o.')
    // The thread lists its drafts
    expect(
      (await session.get<MailThread>(`/sales/threads/${row.id}`)).body.drafts.map((d) => d.id),
    ).toContain(created.body.id)
  })

  it('a draft needs a sending mailbox of the thread: another one is 400, cannot_send 409, needs_reauth 409', async () => {
    const session = await owner()
    const row = threadRow(alarmko(), 'Zanima me protuprovalni sustav')
    const ivana = alarmko().sales.mailboxes.find((m) => m.kind === 'personal')
    const shared = alarmko().sales.mailboxes.find((m) => m.kind === 'shared')
    if (!ivana || !shared) throw new Error('seed')
    // The thread is not in Ivana's mailbox
    expect(
      (
        await session.post(`/sales/threads/${row.id}/drafts`, {
          kind: 'reply',
          mailboxId: ivana.id,
        })
      ).status,
    ).toBe(400)
    shared.canSend = false
    expectProblem(
      await session.post(`/sales/threads/${row.id}/drafts`, { kind: 'reply' }),
      409,
      'mailbox.cannot_send',
    )
    shared.canSend = true
    shared.status = 'needs_reauth'
    expectProblem(
      await session.post(`/sales/threads/${row.id}/drafts`, { kind: 'reply' }),
      409,
      'sales.mailbox_needs_reauth',
    )
    // In a conversation held by two mailboxes the user chooses
    shared.status = 'active'
    const dual = threadRow(alarmko(), 'Kontrola pristupa, 2. kat')
    const fromIvana = await session.post<Draft>(`/sales/threads/${dual.id}/drafts`, {
      kind: 'reply',
      mailboxId: ivana.id,
    })
    expect(fromIvana.body.mailboxId).toBe(ivana.id)
  })

  it('threads from the other tenant do not exist here', async () => {
    const buraThread = bura().sales.threads[0]
    expect((await (await owner()).get(`/sales/threads/${buraThread?.id ?? ''}`)).status).toBe(404)
  })
})
