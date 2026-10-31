import { beforeEach, describe, expect, it } from 'vitest'

import type {
  Mailbox,
  MailThread,
  MailThreadSummaryPage,
  Me,
  Member,
  SalesToday,
} from '@/shared/api/generated/model'

import { resetMockDb } from '../db'
import { loginAs, tenantBySlug, USERS } from './client'
import { alarmko, expectProblem, threadRow } from './sales-helpers'

beforeEach(() => {
  resetMockDb()
})

describe('who has Sales (spec: features ∋ sales and the membership permission)', () => {
  it('/me tells: features and canAccessSales; owners always have it, a dispatcher needs the permission', async () => {
    const owner = (await (await loginAs(USERS.alarmkoOwner)).get<Me>('/me')).body
    expect(owner.features).toEqual(expect.arrayContaining(['sales', 'sales_ai']))
    expect(owner.canAccessSales).toBe(true)

    const dispatcher = (await (await loginAs(USERS.alarmkoDispatcher)).get<Me>('/me')).body
    expect(dispatcher.canAccessSales).toBe(true)

    // Ana has the permission in Alarmko but not in Bura (a dispatcher without access)
    expect((await (await loginAs(USERS.ana)).get<Me>('/me')).body.canAccessSales).toBe(true)
    const inBura = (await (await loginAs(USERS.ana, 'bura-klima')).get<Me>('/me')).body
    expect(inBura.features).toContain('sales')
    expect(inBura.canAccessSales).toBe(false)

    // A technician is never given it by the seed
    expect((await (await loginAs(USERS.ivan)).get<Me>('/me')).body.canAccessSales).toBe(false)
  })

  it('a plan without the module: no feature, no menu, 403 sales.not_enabled', async () => {
    const owner = await loginAs('vlasnik@cisto.test')
    const me = (await owner.get<Me>('/me')).body
    expect(me.features).not.toContain('sales')
    expect(me.canAccessSales).toBe(false)
    expectProblem(await owner.get('/sales/stages'), 403, 'sales.not_enabled')
    expectProblem(await owner.get('/sales/mailboxes'), 403, 'sales.not_enabled')
    // Switching tenant gets there for the shared dispatcher too
    const ana = await loginAs(USERS.ana, 'cisto')
    expectProblem(await ana.get('/sales/board'), 403, 'sales.not_enabled')
  })

  it('no permission: 403 sales.forbidden on every area; owner-only operations 403 for others', async () => {
    const ana = await loginAs(USERS.ana, 'bura-klima')
    for (const path of ['/sales/board', '/sales/threads', '/sales/today', '/sales/settings']) {
      expectProblem(await ana.get(path), 403, 'sales.forbidden')
    }
    const ivan = await loginAs(USERS.ivan)
    expectProblem(await ivan.get('/sales/mailboxes'), 403, 'sales.forbidden')

    // A dispatcher with access still cannot do what only owners do
    const dispatcher = await loginAs(USERS.alarmkoDispatcher)
    expect((await dispatcher.get('/sales/settings')).status).toBe(200)
    expectProblem(await dispatcher.put('/sales/settings', {}), 403, 'auth.forbidden')
    expectProblem(
      await dispatcher.post('/sales/exclusions', { pattern: '@x.test' }),
      403,
      'auth.forbidden',
    )
  })

  it('the permission is set on the team screen: PUT /users/{id} (omitted keeps it, owners ignore it), invitations carry it', async () => {
    const owner = await loginAs(USERS.alarmkoOwner)
    const members = (await owner.get<Member[]>('/users')).body
    const petra = members.find((m) => m.email === USERS.petra)
    const ivana = members.find((m) => m.email === USERS.alarmkoDispatcher)
    const marko = members.find((m) => m.email === USERS.alarmkoOwner)
    if (!petra || !ivana || !marko) throw new Error('seed')
    expect(marko.canAccessSales).toBe(true)
    expect(petra.canAccessSales).toBe(false)

    const given = await owner.put<Member>(`/users/${ivana.userId}`, {
      role: 'dispatcher',
      isActive: true,
      canAccessSales: false,
    })
    expect(given.body.canAccessSales).toBe(false)
    // Omitted: unchanged
    const kept = await owner.put<Member>(`/users/${ivana.userId}`, {
      role: 'dispatcher',
      isActive: true,
    })
    expect(kept.body.canAccessSales).toBe(false)
    // Ivana now hits 403
    expectProblem(
      await (await loginAs(USERS.alarmkoDispatcher)).get('/sales/board'),
      403,
      'sales.forbidden',
    )
    // An owner keeps it whatever is sent
    const self = await owner.put<Member>(`/users/${marko.userId}`, {
      role: 'owner',
      isActive: true,
      canAccessSales: false,
    })
    expect(self.body.canAccessSales).toBe(true)

    const invitation = await owner.post<{ canAccessSales?: boolean }>('/users/invitations', {
      email: 'nova@alarmko.test',
      role: 'dispatcher',
      canAccessSales: true,
    })
    expect(invitation.body.canAccessSales).toBe(true)
  })
})

describe('personal mailboxes are private (owner of the mailbox and tenant owners only)', () => {
  const ivanaMailbox = () => {
    const mailbox = alarmko().sales.mailboxes.find((m) => m.kind === 'personal')
    if (!mailbox) throw new Error('seed')
    return mailbox
  }

  it('lists the mailboxes a user may see', async () => {
    const names = async (email: string) =>
      (await (await loginAs(email)).get<Mailbox[]>('/sales/mailboxes')).body
        .map((m) => m.kind)
        .sort()
    expect(await names(USERS.alarmkoOwner)).toEqual(['personal', 'shared'])
    expect(await names(USERS.alarmkoDispatcher)).toEqual(['personal', 'shared'])
    // Ana is another dispatcher with access: only the shared one
    expect(await names(USERS.ana)).toEqual(['shared'])
  })

  it('a conversation held only in a personal inbox is 404 for others, in lists and by id', async () => {
    const tin = threadRow(alarmko(), 'Upit za nadzor kamera, poslovni prostor')
    const ana = await loginAs(USERS.ana)
    const list = (await ana.get<MailThreadSummaryPage>('/sales/threads?pageSize=200')).body
    expect(list.items.map((t) => t.id)).not.toContain(tin.id)
    expect((await ana.get(`/sales/threads/${tin.id}`)).status).toBe(404)
    expect((await ana.get(`/sales/threads/${tin.id}`)).status).toBe(404)

    const owner = await loginAs(USERS.alarmkoOwner)
    expect((await owner.get(`/sales/threads/${tin.id}`)).status).toBe(200)
    const ivana = await loginAs(USERS.alarmkoDispatcher)
    expect((await ivana.get(`/sales/threads/${tin.id}`)).status).toBe(200)
  })

  it('one conversation in two mailboxes is one thread; a reply only in a personal inbox is not shown to others', async () => {
    const t = alarmko()
    const row = threadRow(t, 'Kontrola pristupa, 2. kat')
    expect(row.mailboxIds).toHaveLength(2)
    const all = (
      await (
        await loginAs(USERS.alarmkoOwner)
      ).get<MailThreadSummaryPage>('/sales/threads?pageSize=200')
    ).body
    expect(all.items.filter((x) => x.id === row.id)).toHaveLength(1)

    const seen = async (email: string) =>
      (await (await loginAs(email)).get<MailThread>(`/sales/threads/${row.id}`)).body
    const ownerView = await seen(USERS.alarmkoOwner)
    const anaView = await seen(USERS.ana)
    expect(ownerView.messages).toHaveLength(3)
    expect(anaView.messages).toHaveLength(2)
    expect(anaView.messages.every((m) => m.direction === 'inbound')).toBe(true)
    // What Ana sees is worked out from what she sees
    expect(anaView.messageCount).toBe(2)
    expect(anaView.awaitingReply).toBe(true)
    expect(ownerView.mailboxes.map((m) => m.kind).sort()).toEqual(['personal', 'shared'])
    expect(anaView.mailboxes.map((m) => m.kind)).toEqual(['shared'])
    expect(anaView.mailbox.kind).toBe('shared')
  })

  it('drafts from a personal mailbox are not visible to others, and cannot be fetched', async () => {
    const t = alarmko()
    const draft = t.sales.drafts.find((d) => d.mailboxId === ivanaMailbox().id)
    if (!draft) throw new Error('seed')
    const ana = await loginAs(USERS.ana)
    expect((await ana.get(`/sales/drafts/${draft.id}`)).status).toBe(404)
    const list = (
      await ana.get<{ id: string }[]>(
        '/sales/drafts?status=generating,ready,edited,saved_to_mailbox,sent,failed',
      )
    ).body
    expect(list.map((d) => d.id)).not.toContain(draft.id)
    expect(
      (await (await loginAs(USERS.alarmkoOwner)).get(`/sales/drafts/${draft.id}`)).status,
    ).toBe(200)
  })

  it('Today does not show others their personal conversations or mailboxes needing attention', async () => {
    const bura = tenantBySlug('bura-klima')
    const maja = bura.sales.mailboxes.find((m) => m.kind === 'personal')
    expect(maja?.status).toBe('error')
    const ownerToday = (await (await loginAs(USERS.buraOwner)).get<SalesToday>('/sales/today')).body
    expect(ownerToday.mailboxesNeedingAttention.map((m) => m.kind)).toEqual(['personal'])
    // The owner of the mailbox sees it too; nobody else without ownership would
    const majaToday = (await (await loginAs(USERS.buraDispatcher)).get<SalesToday>('/sales/today'))
      .body
    expect(majaToday.mailboxesNeedingAttention).toHaveLength(1)
  })
})

describe('the plan check wins over everything', () => {
  it('callback of the OAuth redirect needs no sign-in and never leaks', async () => {
    const response = await fetch(
      'http://localhost/api/v1/sales/mailboxes/oauth/callback?state=nope&code=x',
      {
        redirect: 'manual',
      },
    )
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe(
      `${globalThis.location.origin}/sales/settings/mailboxes?error=provider_error`,
    )
  })
})
