import { beforeEach, describe, expect, it } from 'vitest'

import type {
  Client,
  Deal,
  DealActivity,
  DealConvertResult,
  DealSummaryPage,
  Draft,
  FollowUpRule,
  Job,
  MailThread,
  SalesBoard,
  SalesReport,
  SalesSettings,
  SalesStage,
  SalesToday,
  ValidationProblemDetails,
} from '@/shared/api/generated/model'

import { resetMockDb } from '../db'
import { loginAs, USERS } from './client'
import { alarmko, dealRow, expectProblem, threadRow, userId } from './sales-helpers'
import { getDb } from '../db'

beforeEach(() => {
  resetMockDb()
})

const owner = () => loginAs(USERS.alarmkoOwner)
const stages = async () =>
  (await (await owner()).get<SalesStage[]>('/sales/stages?includeInactive=true')).body
const stageByName = async (name: string) => {
  const stage = (await stages()).find((s) => s.name === name)
  if (!stage) throw new Error(`No stage ${name}`)
  return stage
}
const dealIdOf = (title: string) => dealRow(alarmko(), title).id

describe('the board', () => {
  it('open stages in order, then won and lost; closed columns hold the last 30 days only', async () => {
    const board = (await (await owner()).get<SalesBoard>('/sales/board')).body
    expect(board.columns.map((c) => c.stage.name)).toEqual([
      'Novi upit',
      'Kontaktiran',
      'Ponuda poslana',
      'Pregovori',
      'Dobiven',
      'Izgubljen',
    ])
    expect(board.columns.map((c) => c.stage.kind)).toEqual([
      'open',
      'open',
      'open',
      'open',
      'won',
      'lost',
    ])
    const won = board.columns[4]
    // One deal was won 5 days ago, another 45 days ago (not on the board)
    expect(won?.deals.map((d) => d.title)).toEqual(['Ugradnja alarma, trgovina'])
    expect(won?.totalCount).toBe(1)
    expect(board.columns[3]?.totalValue).toBe('18900.00')
    expect(board.columns[0]?.totalValue).toBe('6050.00')
    expect(board.columns[5]?.deals.map((d) => d.title)).toEqual(['Nadzor skladišta'])
  })

  it('a card tells what the card needs: owner, follow-up, awaiting reply, stale, threads', async () => {
    const board = (await (await owner()).get<SalesBoard>('/sales/board')).body
    const all = board.columns.flatMap((c) => c.deals)
    const find = (title: string) => all.find((d) => d.title === title)
    expect(find('Video nadzor za pekaru')).toMatchObject({
      awaitingReply: true,
      threadCount: 1,
      owner: { fullName: 'Ivana Babić' },
      client: { name: 'Pekara Zlatno zrno d.o.o.' },
    })
    expect(find('Alarm za obiteljsku kuću, Dubrava')?.owner).toBeNull()
    expect(find('Ponuda: servisni ugovor, ljekarna')?.isStale).toBe(true)
    expect(find('Ponuda: nadzor restorana')).toMatchObject({ isStale: false, awaitingReply: false })
    expect(find('Ponuda: nadzor restorana')?.nextFollowUpAt).not.toBeNull()
  })

  it('filters by owner and q, and limits the cards per stage', async () => {
    const session = await owner()
    const ivana = userId(getDb(), USERS.alarmkoDispatcher)
    const mine = (await session.get<SalesBoard>(`/sales/board?ownerUserId=${ivana}`)).body
    expect(mine.columns.flatMap((c) => c.deals).every((d) => d.owner?.id === ivana)).toBe(true)
    const found = (await session.get<SalesBoard>('/sales/board?q=hotel')).body
    expect(found.columns.flatMap((c) => c.deals).map((d) => d.title)).toContain(
      'Pregovori: video nadzor, hotel',
    )
    const limited = (await session.get<SalesBoard>('/sales/board?perStage=1')).body
    expect(limited.columns[0]?.totalCount).toBe(2)
    expect(limited.columns[0]?.deals).toHaveLength(1)
  })
})

describe('deals', () => {
  it('lists with filters (status by stage kind, stale, awaitingReply, owner, q), sort and paging', async () => {
    const session = await owner()
    const list = async (query: string) =>
      (await session.get<DealSummaryPage>(`/sales/deals?${query}`)).body
    expect((await list('status=open')).totalCount).toBe(7)
    expect((await list('status=won')).totalCount).toBe(2)
    expect((await list('status=lost')).totalCount).toBe(1)
    expect((await list('stale=true')).items.map((d) => d.title)).toEqual([
      'Ponuda: servisni ugovor, ljekarna',
    ])
    expect((await list('awaitingReply=true')).items.length).toBeGreaterThan(1)
    expect((await list('q=pekara')).items.map((d) => d.title)).toEqual(['Video nadzor za pekaru'])
    const byValue = (await list('sort=-value&pageSize=2')).items.map((d) => d.value)
    expect(byValue).toEqual(['18900.00', '12500.00'])
    expect((await list('sort=value&pageSize=1')).items[0]?.value).toBe('640.00')
    expect(await list('pageSize=3&page=2')).toMatchObject({ page: 2, pageSize: 3, totalCount: 10 })
  })

  it('creates by hand: defaults (first open stage, the caller as owner, source manual), E.164 phone, activity', async () => {
    const session = await owner()
    const created = await session.post<Deal>('/sales/deals', {
      title: 'Dojava za garažu',
      contactName: 'Nino Perković',
      contactPhone: '091 555 1234',
      contactEmail: 'Nino@Mail.test',
      value: '900.00',
    })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      stage: { name: 'Novi upit', kind: 'open' },
      owner: { fullName: 'Marko Kovač' },
      source: 'manual',
      contactPhone: '+385915551234',
      contactEmail: 'nino@mail.test',
      version: 1,
      threads: [],
    })
    const activities = (
      await session.get<DealActivity[]>(`/sales/deals/${created.body.id}/activities`)
    ).body
    expect(activities.map((a) => a.type)).toEqual(['created'])
    expect(activities[0]).toMatchObject({ actorKind: 'user', actor: { fullName: 'Marko Kovač' } })
  })

  it('validates: title, unknown client/owner/stage, a won or lost stage (that goes through /move), bad phone', async () => {
    const session = await owner()
    const won = await stageByName('Dobiven')
    const empty = await session.post<ValidationProblemDetails>('/sales/deals', { title: '' })
    expect(Object.keys(empty.body.errors)).toEqual(['title'])
    const response = await session.post<ValidationProblemDetails>('/sales/deals', {
      title: 'Nešto',
      clientId: '01a19199-635f-7348-9092-dda88b060f77',
      ownerUserId: '01a19199-635f-7348-9092-dda88b060f77',
      stageId: won.id,
      contactPhone: 'abc',
    })
    expect(response.status).toBe(400)
    expect(Object.keys(response.body.errors).sort()).toEqual([
      'clientId',
      'contactPhone',
      'ownerUserId',
      'stageId',
    ])
  })

  it('edit sends the version: a stale one is 409 and nothing changes; the stage is not touched here', async () => {
    const session = await owner()
    const id = dealIdOf('Dojava požara, vrtić')
    const deal = (await session.get<Deal>(`/sales/deals/${id}`)).body
    const body = { title: 'Dojava požara, vrtić (3 objekta)', version: deal.version, stageId: null }
    const saved = await session.put<Deal>(`/sales/deals/${id}`, body)
    expect(saved.body).toMatchObject({
      title: 'Dojava požara, vrtić (3 objekta)',
      version: deal.version + 1,
    })
    expect(saved.body.stage.id).toBe(deal.stage.id)
    expectProblem(await session.put(`/sales/deals/${id}`, body), 409, 'deal.version_conflict')
    const fields = (await session.get<DealActivity[]>(`/sales/deals/${id}/activities`)).body.find(
      (a) => a.type === 'field_changed',
    )
    expect(fields?.data).toMatchObject({
      fields: expect.arrayContaining(['title', 'clientId']) as string[],
    })
  })

  it('delete: 204; its conversations are unlinked, not deleted', async () => {
    const session = await owner()
    const deal = dealRow(alarmko(), 'Video nadzor za pekaru')
    const thread = threadRow(alarmko(), 'Upit: video nadzor za pekaru')
    expect((await session.del(`/sales/deals/${deal.id}`)).status).toBe(204)
    expect((await session.get(`/sales/deals/${deal.id}`)).status).toBe(404)
    expect((await session.get<MailThread>(`/sales/threads/${thread.id}`)).body.deal).toBeNull()
  })

  it('the deal shows its conversations (only the visible ones) and its timeline newest first', async () => {
    const session = await owner()
    const deal = (await session.get<Deal>(`/sales/deals/${dealIdOf('Kontrola pristupa, 2. kat')}`))
      .body
    expect(deal.threads.map((t) => t.subject)).toEqual(['Kontrola pristupa, 2. kat'])
    const activities = (await session.get<DealActivity[]>(`/sales/deals/${deal.id}/activities`))
      .body
    const times = activities.map((a) => a.at)
    expect(times).toEqual([...times].sort().reverse())
    expect(activities.at(-1)?.type).toBe('created')
  })
})

describe('moving a deal', () => {
  it('moves and records stage_changed with the stages; the same stage is a no-op', async () => {
    const session = await owner()
    const id = dealIdOf('Video nadzor za pekaru')
    const target = await stageByName('Kontaktiran')
    const moved = await session.post<Deal>(`/sales/deals/${id}/move`, { stageId: target.id })
    expect(moved.body.stage.id).toBe(target.id)
    const change = (await session.get<DealActivity[]>(`/sales/deals/${id}/activities`)).body.find(
      (a) => a.type === 'stage_changed',
    )
    expect(change?.data).toMatchObject({ toStageId: target.id })
    const same = await session.post<Deal>(`/sales/deals/${id}/move`, { stageId: target.id })
    expect(same.body.version).toBe(moved.body.version)
  })

  it('a lost stage needs a reason: 400 sales.lost_reason_required, also in errors.lostReason', async () => {
    const session = await owner()
    const id = dealIdOf('Video nadzor za pekaru')
    const lost = await stageByName('Izgubljen')
    const response = await session.post<ValidationProblemDetails>(`/sales/deals/${id}/move`, {
      stageId: lost.id,
    })
    expectProblem(response, 400, 'sales.lost_reason_required')
    expect(response.body.errors).toHaveProperty('lostReason')
    const done = await session.post<Deal>(`/sales/deals/${id}/move`, {
      stageId: lost.id,
      lostReason: 'competitor',
      lostNote: 'Odabrali drugog',
    })
    expect(done.body).toMatchObject({
      lostReason: 'competitor',
      lostNote: 'Odabrali drugog',
      nextFollowUpAt: null,
    })
    expect(done.body.lostAt).not.toBeNull()
    // Moving back out of lost clears it
    const reopened = await session.post<Deal>(`/sales/deals/${id}/move`, {
      stageId: (await stageByName('Novi upit')).id,
    })
    expect(reopened.body).toMatchObject({ lostReason: null, lostAt: null, wonAt: null })
  })

  it('won sets wonAt; a stale version is 409; an unknown stage is 400', async () => {
    const session = await owner()
    const id = dealIdOf('Dojava požara, vrtić')
    const deal = (await session.get<Deal>(`/sales/deals/${id}`)).body
    const won = await stageByName('Dobiven')
    expectProblem(
      await session.post(`/sales/deals/${id}/move`, { stageId: won.id, version: deal.version + 5 }),
      409,
      'deal.version_conflict',
    )
    expect(
      (
        await session.post(`/sales/deals/${id}/move`, {
          stageId: '01a19199-635f-7348-9092-dda88b060f77',
        })
      ).status,
    ).toBe(400)
    const moved = await session.post<Deal>(`/sales/deals/${id}/move`, {
      stageId: won.id,
      version: deal.version,
    })
    expect(moved.body.wonAt).not.toBeNull()
    expect(moved.body.nextFollowUpAt).toBeNull()
  })
})

describe('notes and follow-up', () => {
  it('a note goes on the timeline', async () => {
    const session = await owner()
    const id = dealIdOf('Video nadzor za pekaru')
    const note = await session.post<DealActivity>(`/sales/deals/${id}/notes`, {
      text: '  Zvati u ponedjeljak.  ',
    })
    expect(note.status).toBe(201)
    expect(note.body).toMatchObject({
      type: 'note',
      text: 'Zvati u ponedjeljak.',
      actorKind: 'user',
    })
    expect((await session.post(`/sales/deals/${id}/notes`, { text: '' })).status).toBe(400)
  })

  it('done, snooze, set, clear: the date and the timeline', async () => {
    const session = await owner()
    const id = dealIdOf('Ponuda: nadzor restorana')
    const until = new Date(Date.now() + 3 * 86_400_000).toISOString()
    const post = (body: object) => session.post<Deal>(`/sales/deals/${id}/follow-up`, body)
    expect((await post({ action: 'snooze' })).status).toBe(400)
    const snoozed = await post({ action: 'snooze', until, note: 'Čekaju direktora' })
    expect(snoozed.body.nextFollowUpAt).toBe(until)
    expect((await post({ action: 'clear' })).body.nextFollowUpAt).toBeNull()
    expect((await post({ action: 'set', until })).body.nextFollowUpAt).toBe(until)
    const done = await post({ action: 'done' })
    expect(done.body.nextFollowUpAt).toBeNull()
    expect(done.body.lastContactAt).not.toBeNull()
    const types = (await session.get<DealActivity[]>(`/sales/deals/${id}/activities`)).body.map(
      (a) => a.type,
    )
    expect(types).toEqual(
      expect.arrayContaining(['follow_up_snoozed', 'follow_up_done', 'field_changed']),
    )
  })
})

describe('converting a won deal', () => {
  const jobTypeId = () => {
    const type = alarmko().jobTypes.find((jt) => jt.isActive)
    if (!type) throw new Error('seed')
    return type.id
  }

  it('creates the client with a location and a job in status new, in one go; the deal is won and holds the job', async () => {
    const session = await owner()
    const id = dealIdOf('Nadzor skladišta')
    const response = await session.post<DealConvertResult>(`/sales/deals/${id}/convert`, {
      newClient: {
        type: 'company',
        name: 'Skladište Radić d.o.o.',
        // A field the tenant configured as required
        customFields: { monitoring_contract: 'standard' },
        contacts: [
          {
            name: 'Dario Radić',
            email: 'dario@skladiste.test',
            phone: '0915559999',
            isPrimary: true,
          },
        ],
        firstLocation: { street: 'Industrijska 4', city: 'Zagreb', postalCode: '10000' },
      },
      job: { jobTypeId: jobTypeId(), title: 'Ugradnja nadzora skladišta', priority: 'high' },
    })
    expect(response.status).toBe(201)
    const { deal, clientId, locationId, jobId } = response.body
    expect(deal).toMatchObject({
      jobId,
      client: { id: clientId },
      stage: { kind: 'won' },
      version: expect.any(Number) as number,
    })
    expect(deal.wonAt).not.toBeNull()
    const job = (await session.get<Job>(`/jobs/${jobId}`)).body
    expect(job).toMatchObject({
      status: 'new',
      title: 'Ugradnja nadzora skladišta',
      priority: 'high',
    })
    expect(job.location.id).toBe(locationId)
    expect(job.client.id).toBe(clientId)
    expect((await session.get<Client>(`/clients/${clientId}`)).body.name).toBe(
      'Skladište Radić d.o.o.',
    )
    const types = (await session.get<DealActivity[]>(`/sales/deals/${id}/activities`)).body.map(
      (a) => a.type,
    )
    expect(types).toContain('converted')
    // Again: already converted
    expectProblem(
      await session.post(`/sales/deals/${id}/convert`, {
        clientId,
        job: { jobTypeId: jobTypeId(), title: 'x' },
      }),
      409,
      'sales.deal_already_converted',
    )
  })

  it('uses an existing client and its location; attachments saved to the deal are copied to the job; markWon false keeps the stage', async () => {
    const session = await owner()
    const deal = dealRow(alarmko(), 'Dojava požara, vrtić')
    const client = alarmko().clients.find((c) => c.name === 'Dječji vrtić Sunčica')
    if (!client) throw new Error('seed')
    // A file from a conversation of the deal
    alarmko().attachments.push({
      id: '01a19199-635f-7348-9092-dda88b060f01',
      ownerType: 'deal',
      ownerId: deal.id,
      kind: 'pdf',
      fileName: 'tlocrt.pdf',
      mime: 'application/pdf',
      sizeBytes: 1000,
      takenAt: null,
      createdAt: new Date().toISOString(),
      deletedAt: null,
      state: 'confirmed',
      availableAt: null,
      preview: null,
    })
    const response = await session.post<DealConvertResult>(`/sales/deals/${deal.id}/convert`, {
      clientId: client.id,
      markWon: false,
      job: { jobTypeId: jobTypeId(), title: 'Ugradnja dojave požara' },
    })
    expect(response.status).toBe(201)
    expect(response.body.deal.stage.kind).toBe('open')
    expect(response.body.clientId).toBe(client.id)
    const copied = (
      await session.get<{ fileName: string }[]>(
        `/attachments?ownerType=job&ownerId=${response.body.jobId}`,
      )
    ).body
    expect(copied.map((a) => a.fileName)).toEqual(['tlocrt.pdf'])
  })

  it('400 with the paths of the request; nothing is created when anything is wrong', async () => {
    const session = await owner()
    const id = dealIdOf('Nadzor skladišta')
    const clientsBefore = alarmko().clients.length
    const jobsBefore = alarmko().jobs.length
    const response = await session.post<ValidationProblemDetails>(`/sales/deals/${id}/convert`, {
      newClient: {
        type: 'company',
        name: 'Neki d.o.o.',
        customFields: { monitoring_contract: 'none' },
        contacts: [{ name: 'Netko', phone: '0911111111', isPrimary: true }],
      },
      job: { jobTypeId: '01a19199-635f-7348-9092-dda88b060f77', title: 'x' },
    })
    expect(response.status).toBe(400)
    expect(Object.keys(response.body.errors)).toEqual(['newClient.firstLocation'])
    const client = alarmko().clients.find((c) => c.name === 'Dječji vrtić Sunčica')
    const badJob = await session.post<ValidationProblemDetails>(`/sales/deals/${id}/convert`, {
      clientId: client?.id,
      job: { jobTypeId: '01a19199-635f-7348-9092-dda88b060f77', title: 'x' },
    })
    expect(Object.keys(badJob.body.errors)).toEqual(['job.jobTypeId'])
    expect(alarmko().clients).toHaveLength(clientsBefore)
    expect(alarmko().jobs).toHaveLength(jobsBefore)
    const none = await session.post<ValidationProblemDetails>(`/sales/deals/${id}/convert`, {
      job: { jobTypeId: jobTypeId(), title: 'x' },
    })
    expect(none.body.errors).toHaveProperty('clientId')
  })
})

describe('drafts', () => {
  const draftOf = (threadSubject: string, status: string) => {
    const thread = threadRow(alarmko(), threadSubject)
    const draft = alarmko().sales.drafts.find(
      (d) => d.threadId === thread.id && d.status === status,
    )
    if (!draft) throw new Error('seed')
    return draft
  }

  it('lists the ones to review by default (generating, ready, edited); by status, deal or thread otherwise', async () => {
    const session = await owner()
    const list = async (query = '') => (await session.get<Draft[]>(`/sales/drafts${query}`)).body
    expect((await list()).map((d) => d.status).sort()).toEqual([
      'edited',
      'generating',
      'ready',
      'ready',
    ])
    expect((await list('?status=sent,failed')).map((d) => d.status).sort()).toEqual([
      'failed',
      'sent',
    ])
    const thread = threadRow(alarmko(), 'Ponuda za servisni ugovor')
    expect(await list(`?threadId=${thread.id}&status=failed`)).toHaveLength(1)
    const deal = dealRow(alarmko(), 'Ponuda: nadzor restorana')
    expect((await list(`?dealId=${deal.id}`)).map((d) => d.kind)).toEqual(['follow_up'])
  })

  it('editing needs the version and makes it "edited"; a stale version is 409; a draft being written is 409', async () => {
    const session = await owner()
    const ready = draftOf('Upit: video nadzor za pekaru', 'ready')
    const version = ready.version
    const edit = {
      subject: 'Re: Termin',
      bodyText: 'Vidimo se u četvrtak.',
      to: [{ email: 'goran@zlatnozrno.test', name: 'Goran Lovrić' }],
      cc: [],
      version,
    }
    const saved = await session.put<Draft>(`/sales/drafts/${ready.id}`, edit)
    expect(saved.body).toMatchObject({
      status: 'edited',
      subject: 'Re: Termin',
      version: version + 1,
    })
    expectProblem(
      await session.put(`/sales/drafts/${ready.id}`, edit),
      409,
      'draft.version_conflict',
    )
    const generating = draftOf('Alarm za kuću, Dubrava', 'generating')
    expectProblem(
      await session.put(`/sales/drafts/${generating.id}`, { ...edit, version: generating.version }),
      409,
      'draft.not_ready',
    )
  })

  it('save to the mailbox: 200 with the status; cannot send / needs reauth is 409', async () => {
    const session = await owner()
    const ready = draftOf('Upit: video nadzor za pekaru', 'ready')
    const saved = await session.post<Draft>(`/sales/drafts/${ready.id}/save-to-mailbox`)
    expect(saved.body.status).toBe('saved_to_mailbox')
    expect(ready.providerDraftId).toBeTruthy()
    const mailbox = alarmko().sales.mailboxes.find((m) => m.id === ready.mailboxId)
    if (!mailbox) throw new Error('seed')
    mailbox.canSend = false
    expectProblem(
      await session.post(`/sales/drafts/${ready.id}/save-to-mailbox`),
      409,
      'mailbox.cannot_send',
    )
    mailbox.canSend = true
    mailbox.status = 'needs_reauth'
    expectProblem(
      await session.post(`/sales/drafts/${ready.id}/save-to-mailbox`),
      409,
      'sales.mailbox_needs_reauth',
    )
  })

  it('send puts an outbound message in the conversation, marks the draft sent, moves the deal’s last contact; sending twice is 409', async () => {
    const session = await owner()
    const ready = draftOf('Upit: video nadzor za pekaru', 'ready')
    const thread = threadRow(alarmko(), 'Upit: video nadzor za pekaru')
    const response = await session.post<Draft>(`/sales/drafts/${ready.id}/send`, {
      version: ready.version,
    })
    expect(response.body).toMatchObject({ status: 'sent' })
    expect(response.body.sentAt).not.toBeNull()
    const after = (await session.get<MailThread>(`/sales/threads/${thread.id}`)).body
    expect(after.messages.at(-1)).toMatchObject({ direction: 'outbound', subject: ready.subject })
    expect(after.awaitingReply).toBe(false)
    const deal = dealRow(alarmko(), 'Video nadzor za pekaru')
    expect(deal.lastContactAt).toBe(response.body.sentAt)
    const types = alarmko()
      .sales.activities.filter((a) => a.dealId === deal.id)
      .map((a) => a.type)
    expect(types).toEqual(expect.arrayContaining(['draft_sent', 'email_out']))
    expectProblem(
      await session.post(`/sales/drafts/${ready.id}/send`, { version: ready.version + 1 }),
      409,
      'draft.already_sent',
    )
  })

  it('send checks: a stale version is 409, no recipient is 400, a mailbox that cannot send is 409; the draft stays', async () => {
    const session = await owner()
    const ready = draftOf('Upit: video nadzor za pekaru', 'ready')
    expectProblem(
      await session.post(`/sales/drafts/${ready.id}/send`, { version: ready.version + 3 }),
      409,
      'draft.version_conflict',
    )
    ready.to = []
    const bad = await session.post<ValidationProblemDetails>(`/sales/drafts/${ready.id}/send`, {
      version: ready.version,
    })
    expect(bad.status).toBe(400)
    expect(bad.body.errors).toHaveProperty('to')
    ready.to = [{ email: 'goran@zlatnozrno.test', name: null }]
    const mailbox = alarmko().sales.mailboxes.find((m) => m.id === ready.mailboxId)
    if (mailbox) mailbox.canSend = false
    expectProblem(
      await session.post(`/sales/drafts/${ready.id}/send`, { version: ready.version }),
      409,
      'mailbox.cannot_send',
    )
    expect(ready.status).toBe('ready')
  })

  it('a reply from a personal inbox stays in that inbox: others do not see the sent message', async () => {
    const session = await loginAs(USERS.alarmkoDispatcher)
    const draft = draftOf('Kontrola pristupa, 2. kat', 'edited')
    expect(
      (await session.post<Draft>(`/sales/drafts/${draft.id}/send`, { version: draft.version })).body
        .status,
    ).toBe('sent')
    const ana = await loginAs(USERS.ana)
    const thread = threadRow(alarmko(), 'Kontrola pristupa, 2. kat')
    const seen = (await ana.get<MailThread>(`/sales/threads/${thread.id}`)).body
    expect(seen.messages.filter((m) => m.direction === 'outbound')).toHaveLength(0)
  })

  it('discard: 204 and it is gone', async () => {
    const session = await owner()
    const ready = draftOf('Upit: video nadzor za pekaru', 'ready')
    expect((await session.del(`/sales/drafts/${ready.id}`)).status).toBe(204)
    expect((await session.get(`/sales/drafts/${ready.id}`)).status).toBe(404)
  })
})

describe('stages', () => {
  it('lists in board order; inactive only on request', async () => {
    const session = await owner()
    const list = (await session.get<SalesStage[]>('/sales/stages')).body
    expect(list.map((s) => s.position)).toEqual([1, 2, 3, 4, 5, 6])
    const target = list[1]
    if (!target) throw new Error('seed')
    await session.put(`/sales/stages/${target.id}`, { ...target, isActive: false })
    expect((await session.get<SalesStage[]>('/sales/stages')).body).toHaveLength(5)
    expect(
      (await session.get<SalesStage[]>('/sales/stages?includeInactive=true')).body,
    ).toHaveLength(6)
    // A deactivated stage leaves the board
    const board = (await session.get<SalesBoard>('/sales/board')).body
    expect(board.columns.map((c) => c.stage.id)).not.toContain(target.id)
  })

  it('a new open stage goes before won and lost; names are unique; a second won stage is 400', async () => {
    const session = await owner()
    const created = await session.post<SalesStage>('/sales/stages', {
      name: 'Odluka',
      color: '#0ea5e9',
      kind: 'open',
      followUpDays: 2,
      isActive: true,
    })
    expect(created.status).toBe(201)
    expect(created.body.position).toBe(5)
    const all = (await session.get<SalesStage[]>('/sales/stages')).body
    expect(all.map((s) => s.name).slice(-3)).toEqual(['Odluka', 'Dobiven', 'Izgubljen'])
    expect(
      (
        await session.post('/sales/stages', {
          name: 'odluka',
          color: '#0ea5e9',
          kind: 'open',
          isActive: true,
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await session.post('/sales/stages', {
          name: 'Drugi dobiven',
          color: '#0ea5e9',
          kind: 'won',
          isActive: true,
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await session.post('/sales/stages', {
          name: 'x',
          color: 'red',
          kind: 'open',
          isActive: true,
        })
      ).status,
    ).toBe(400)
  })

  it('reorders with all the ids; anything else is 400', async () => {
    const session = await owner()
    const list = (await session.get<SalesStage[]>('/sales/stages')).body
    const ids = list.map((s) => s.id)
    const reversed = [...ids].reverse()
    const result = await session.put<SalesStage[]>('/sales/stages/order', { stageIds: reversed })
    expect(result.body.map((s) => s.id)).toEqual(reversed)
    expect((await session.put('/sales/stages/order', { stageIds: ids.slice(1) })).status).toBe(400)
    // The board keeps open stages first, then won and lost
    const board = (await session.get<SalesBoard>('/sales/board')).body
    expect(board.columns.map((c) => c.stage.kind)).toEqual([
      'open',
      'open',
      'open',
      'open',
      'won',
      'lost',
    ])
  })

  it('exactly one active won and one active lost: changing or removing it is 409 sales.stage_required', async () => {
    const session = await owner()
    const won = await stageByName('Dobiven')
    expectProblem(
      await session.put(`/sales/stages/${won.id}`, { ...won, kind: 'open' }),
      409,
      'sales.stage_required',
    )
    expectProblem(
      await session.put(`/sales/stages/${won.id}`, { ...won, isActive: false }),
      409,
      'sales.stage_required',
    )
    // The stage is unchanged
    expect((await stageByName('Dobiven')).kind).toBe('won')
    const lost = await stageByName('Izgubljen')
    // Nothing is in it besides one deal: that is the first reason
    expectProblem(await session.del(`/sales/stages/${lost.id}`), 409, 'sales.stage_in_use')
  })

  it('a stage that still holds deals cannot be deleted (409 sales.stage_in_use); an empty one can, with its rules', async () => {
    const session = await owner()
    const offer = await stageByName('Ponuda poslana')
    expectProblem(await session.del(`/sales/stages/${offer.id}`), 409, 'sales.stage_in_use')
    const created = await session.post<SalesStage>('/sales/stages', {
      name: 'Privremena',
      color: '#111111',
      kind: 'open',
      isActive: true,
    })
    await session.post('/sales/follow-up-rules', {
      name: 'Za privremenu',
      stageId: created.body.id,
      daysWithoutReply: 2,
      createDraft: false,
      isActive: true,
    })
    expect((await session.del(`/sales/stages/${created.body.id}`)).status).toBe(204)
    const rules = (await session.get<FollowUpRule[]>('/sales/follow-up-rules')).body
    expect(rules.map((r) => r.name)).not.toContain('Za privremenu')
    // Stage sets differ between tenants
    expect(
      (await (await loginAs(USERS.buraOwner)).get<SalesStage[]>('/sales/stages')).body.map(
        (s) => s.name,
      ),
    ).toContain('Obilazak')
  })
})

describe('follow-up rules, exclusions, settings', () => {
  it('rules: create, edit, delete; days 1–90; the stage must be an open one', async () => {
    const session = await owner()
    const input = {
      name: 'Pregovori, 2 dana',
      daysWithoutReply: 2,
      createDraft: true,
      isActive: true,
    }
    const pregovori = await stageByName('Pregovori')
    const created = await session.post<FollowUpRule>('/sales/follow-up-rules', {
      ...input,
      stageId: pregovori.id,
    })
    expect(created.body).toMatchObject({ ...input, stageId: pregovori.id })
    const changed = await session.put<FollowUpRule>(`/sales/follow-up-rules/${created.body.id}`, {
      ...input,
      daysWithoutReply: 5,
      stageId: null,
    })
    expect(changed.body).toMatchObject({ daysWithoutReply: 5, stageId: null })
    expect(
      (await session.post('/sales/follow-up-rules', { ...input, daysWithoutReply: 0 })).status,
    ).toBe(400)
    expect(
      (await session.post('/sales/follow-up-rules', { ...input, daysWithoutReply: 91 })).status,
    ).toBe(400)
    expect(
      (
        await session.post('/sales/follow-up-rules', {
          ...input,
          stageId: (await stageByName('Dobiven')).id,
        })
      ).status,
    ).toBe(400)
    expect((await session.del(`/sales/follow-up-rules/${created.body.id}`)).status).toBe(204)
    expect((await session.get<FollowUpRule[]>('/sales/follow-up-rules')).body).toHaveLength(2)
  })

  it('exclusions: address or @domain, lower-case, unique; delete', async () => {
    const session = await owner()
    const created = await session.post<{ id: string; pattern: string }>('/sales/exclusions', {
      pattern: 'Spam@Firma.test',
      note: 'ne pratiti',
    })
    expect(created.body.pattern).toBe('spam@firma.test')
    expect((await session.post('/sales/exclusions', { pattern: 'spam@firma.test' })).status).toBe(
      400,
    )
    expect((await session.post('/sales/exclusions', { pattern: 'nije adresa' })).status).toBe(400)
    const domain = await session.post<{ pattern: string }>('/sales/exclusions', {
      pattern: '@Firma.test',
    })
    expect(domain.body.pattern).toBe('@firma.test')
    expect((await session.get<unknown[]>('/sales/exclusions')).body).toHaveLength(4)
    expect((await session.del(`/sales/exclusions/${created.body.id}`)).status).toBe(204)
    expect((await session.del(`/sales/exclusions/${created.body.id}`)).status).toBe(404)
  })

  it('settings: read by anyone with access, written by owners; recipients must be members; review threshold decides "Za pregled"', async () => {
    const session = await owner()
    const settings = (await session.get<SalesSettings>('/sales/settings')).body
    expect(settings).toMatchObject({
      tone: 'neutral',
      responseSlaHours: 4,
      aiEnabled: true,
      reviewThreshold: 0.7,
    })
    const saved = await session.put<SalesSettings>('/sales/settings', {
      ...settings,
      tone: 'formal',
      reviewThreshold: 0.95,
      knowledge: 'Nova pravila.',
    })
    expect(saved.body).toMatchObject({
      tone: 'formal',
      reviewThreshold: 0.95,
      knowledge: 'Nova pravila.',
    })
    const review = (await session.get<{ totalCount: number }>('/sales/threads?needsReview=true'))
      .body
    expect(review.totalCount).toBeGreaterThan(10)
    const bad = await session.put<ValidationProblemDetails>('/sales/settings', {
      ...settings,
      digestRecipientIds: ['01a19199-635f-7348-9092-dda88b060f77'],
      retentionDays: 10,
    })
    expect(bad.status).toBe(400)
    expect(Object.keys(bad.body.errors)).toEqual(expect.arrayContaining(['retentionDays']))
  })
})

describe('Today (GET /sales/today)', () => {
  const today = async (email: string = USERS.alarmkoOwner, query = '') =>
    (await (await loginAs(email)).get<SalesToday>(`/sales/today${query}`)).body

  it('has the date of the tenant, and overdue first, then by due time', async () => {
    const result = await today()
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.items.length).toBeGreaterThan(3)
    const now = Date.now()
    const overdue = result.items.filter((i) => i.dueAt && Date.parse(i.dueAt) < now)
    const rest = result.items.slice(overdue.length)
    expect(result.items.slice(0, overdue.length)).toEqual(overdue)
    expect(rest.every((i) => !i.dueAt || Date.parse(i.dueAt) >= now)).toBe(true)
    const times = (list: typeof overdue) => list.map((i) => i.dueAt ?? '')
    expect(times(overdue)).toEqual([...times(overdue)].sort())
    expect(times(rest)).toEqual([...times(rest)].sort())
  })

  it('reasons: follow_up_due (the deal’s date or a rule), unanswered (response time), stale', async () => {
    const result = await today()
    const by = (subject: string) => result.items.find((i) => i.thread.subject === subject)
    // A rule: offer sent 5 days ago without an answer, 3 working days
    expect(by('Ponuda: nadzor restorana')?.reason).toBe('follow_up_due')
    expect(by('Ponuda: nadzor restorana')?.draft?.kind).toBe('follow_up')
    // The deal's own date (due today)
    expect(by('Dojava požara, ponuda')?.reason).toBe('follow_up_due')
    // The client wrote last and the answer is due
    expect(by('Zanima me protuprovalni sustav')?.reason).toBe('unanswered')
    // Nobody touched the deal for 15 days: the rule fires first; without rules it is "stale"
    expect(by('Ponuda za servisni ugovor')?.reason).toBe('follow_up_due')
    for (const rule of alarmko().sales.followUpRules) rule.isActive = false
    expect(
      (await today()).items.find((i) => i.thread.subject === 'Ponuda za servisni ugovor')?.reason,
    ).toBe('stale')
    expect(result.staleDeals?.map((d) => d.title)).toEqual(['Ponuda: servisni ugovor, ljekarna'])
    // A reason once per conversation; closed deals and non-sales threads are not here
    const ids = result.items.map((i) => i.thread.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(result.items.some((i) => i.thread.subject === 'Servis sustava, ured')).toBe(false)
    expect(result.items.every((i) => i.thread.classification?.isSales !== false)).toBe(true)
  })

  it('answered inbound is not "unanswered"; the response time of the settings moves the due time', async () => {
    const result = await today()
    expect(
      result.items.find((i) => i.thread.subject === 'Koliko košta ugradnja alarma u stan?'),
    ).toBeUndefined()
    const sandra = result.items.find((i) => i.thread.subject === 'Zanima me protuprovalni sustav')
    if (!sandra?.dueAt) throw new Error('seed')
    alarmko().sales.settings.responseSlaHours = 24
    const slower = (await today()).items.find(
      (i) => i.thread.subject === 'Zanima me protuprovalni sustav',
    )
    // 8 hours ago + 24 h is in the future (tomorrow), so not on today's list any more
    expect(slower).toBeUndefined()
  })

  it('whose list: the caller’s deals and unowned shared conversations by default; owners may pass a user or omit for everyone', async () => {
    const ivana = await today(USERS.alarmkoDispatcher)
    // Ivana's deals and the unassigned conversations of the shared mailbox
    expect(
      ivana.items.every((i) => !i.deal?.owner || i.deal.owner.fullName === 'Ivana Babić'),
    ).toBe(true)
    expect(ivana.items.some((i) => i.deal?.owner?.fullName === 'Marko Kovač')).toBe(false)
    expect(ivana.items.some((i) => i.deal === null)).toBe(true)

    const everyone = await today()
    const owners = new Set(everyone.items.map((i) => i.deal?.owner?.fullName).filter(Boolean))
    expect(owners.size).toBeGreaterThan(1)

    const id = userId(getDb(), USERS.alarmkoDispatcher)
    const forIvana = await today(USERS.alarmkoOwner, `?ownerUserId=${id}`)
    expect(forIvana.items.map((i) => i.thread.id).sort()).toEqual(
      ivana.items.map((i) => i.thread.id).sort(),
    )

    // A dispatcher cannot look at someone else
    const marko = userId(getDb(), USERS.alarmkoOwner)
    expectProblem(
      await (await loginAs(USERS.alarmkoDispatcher)).get(`/sales/today?ownerUserId=${marko}`),
      403,
      'sales.forbidden',
    )
  })

  it('counts what needs a look: needsReviewCount and the mailboxes with a problem', async () => {
    const result = await today()
    expect(result.needsReviewCount).toBe(
      (
        await (
          await owner()
        ).get<{ totalCount: number }>('/sales/threads?needsReview=true&pageSize=1')
      ).body.totalCount,
    )
    expect(result.mailboxesNeedingAttention).toEqual([])
    const buraToday = await today(USERS.buraOwner)
    expect(buraToday.mailboxesNeedingAttention).toHaveLength(1)
    expect(buraToday.mailboxesNeedingAttention[0]).toMatchObject({
      provider: 'imap',
      status: 'error',
    })
    expect(buraToday.mailboxesNeedingAttention[0]?.lastError).toContain('IMAP')
  })
})

describe('the report', () => {
  const report = async (query: string) =>
    (await (await owner()).get<SalesReport>(`/sales/reports/summary?${query}`)).body
  const iso = (offsetDays: number) =>
    new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)

  it('counts created, won and lost in the range, with value, win rate and reasons', async () => {
    const result = await report(`from=${iso(-90)}&to=${iso(0)}`)
    expect(result).toMatchObject({
      dealsCreated: 10,
      dealsWon: 2,
      dealsLost: 1,
      wonValue: '2940.00',
    })
    expect(result.winRate).toBeCloseTo(2 / 3)
    expect(result.openValue).toBe('50050.00')
    expect(result.lostReasons).toEqual([{ reason: 'price', count: 1 }])
    expect(result.bySource.find((s) => s.source === 'phone')).toEqual({
      source: 'phone',
      created: 1,
      won: 0,
    })
    expect(result.stageTimes.map((s) => s.name)).toContain('Ponuda poslana')
    // A narrow range: only what happened then
    const week = await report(`from=${iso(-7)}&to=${iso(0)}`)
    expect(week.dealsWon).toBe(1)
    expect(week.dealsLost).toBe(0)
    const nothing = await report(`from=${iso(-400)}&to=${iso(-300)}`)
    expect(nothing).toMatchObject({
      dealsCreated: 0,
      winRate: null,
      wonValue: null,
      openValue: expect.any(String) as string,
    })
  })

  it('the median first answer comes from visible conversations; from and to are required and ordered', async () => {
    const result = await report(`from=${iso(-90)}&to=${iso(0)}`)
    expect(result.medianFirstResponseMinutes).toBeGreaterThan(0)
    const session = await owner()
    expect((await session.get('/sales/reports/summary')).status).toBe(400)
    expect((await session.get(`/sales/reports/summary?from=${iso(0)}&to=${iso(-5)}`)).status).toBe(
      400,
    )
    expect((await session.get('/sales/reports/summary?from=jučer&to=danas')).status).toBe(400)
  })
})
