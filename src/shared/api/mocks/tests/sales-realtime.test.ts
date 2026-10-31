import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Draft } from '@/shared/api/generated/model'
import { startHub, type HubEvent } from '@/shared/api/realtime/hub'
import { env } from '@/shared/config/env'

import { resetMockDb } from '../db'
import { dropConnections, openConnections } from '../lib/realtime'
import { settleDue } from '../lib/sales/ai'
import { loginAs, USERS, type Session } from './client'
import { alarmko, dealRow, letAiFinish, threadRow } from './sales-helpers'

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

const quiet = () => new Promise((resolve) => setTimeout(resolve, 100))
const sales = (events: HubEvent[]) =>
  events.filter((e) => ['SalesThreadUpdated', 'DealUpdated', 'DraftReady'].includes(e.type))

describe('Sales events of the hub (group sales:{tenantId})', () => {
  it('a deal that moved is told to users with sales access of that tenant only', async () => {
    const mover = await loginAs(USERS.alarmkoOwner)
    const ivana = await listen(await loginAs(USERS.alarmkoDispatcher))
    const owner = await listen(mover)
    // A technician is in the tenant, but has no sales access
    const technician = await listen(await loginAs(USERS.ivan))
    // Another tenant's owner
    const other = await listen(await loginAs(USERS.buraOwner))
    // The same dispatcher's seat in the tenant without the permission
    const noAccess = await listen(await loginAs(USERS.ana, 'bura-klima'))

    const deal = dealRow(alarmko(), 'Video nadzor za pekaru')
    const target = alarmko().sales.stages.find((s) => s.name === 'Kontaktiran')
    await mover.post(`/sales/deals/${deal.id}/move`, { stageId: target?.id })

    await until(() => sales(owner.events).length >= 1 && sales(ivana.events).length >= 1)
    expect(sales(owner.events)).toEqual([{ type: 'DealUpdated', payload: { dealId: deal.id } }])
    expect(sales(ivana.events)).toEqual([{ type: 'DealUpdated', payload: { dealId: deal.id } }])
    await quiet()
    expect(sales(technician.events)).toEqual([])
    expect(sales(other.events)).toEqual([])
    expect(sales(noAccess.events)).toEqual([])
    await Promise.all([owner, ivana, technician, other, noAccess].map((l) => l.hub.stop()))
  })

  it('SalesThreadUpdated when a conversation changes (correction), DraftReady when a draft is written', async () => {
    const session = await loginAs(USERS.alarmkoOwner)
    const listener = await listen(session)
    const thread = threadRow(alarmko(), 'Zanima me protuprovalni sustav')

    await session.put(`/sales/threads/${thread.id}/classification`, {
      category: 'new_inquiry',
      isSales: true,
    })
    await until(() => sales(listener.events).length >= 1)
    expect(sales(listener.events)[0]).toEqual({
      type: 'SalesThreadUpdated',
      payload: { threadId: thread.id, dealId: null },
    })

    const draft = (
      await session.post<Draft>(`/sales/threads/${thread.id}/drafts`, { kind: 'reply' })
    ).body
    letAiFinish()
    // What was due finishes: the draft is ready and the hub says so
    settleDue(alarmko().tenant.id, alarmko(), Date.now())
    await until(() => listener.events.some((e) => e.type === 'DraftReady'))
    expect(listener.events.find((e) => e.type === 'DraftReady')).toEqual({
      type: 'DraftReady',
      payload: { draftId: draft.id, threadId: thread.id, status: 'ready' },
    })
    await listener.hub.stop()
  })
})
