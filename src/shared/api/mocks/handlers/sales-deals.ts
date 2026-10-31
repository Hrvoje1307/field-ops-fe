import type {
  DealConvertRequest,
  DealCreate,
  DealMoveRequest,
  DealNoteInput,
  DealUpdate,
  FollowUpAction,
  GetSalesBoardParams,
  JobCreate,
  ListDealsParams,
} from '@/shared/api/generated/model'
import { toIsoInstant } from '@/shared/lib/datetime'

import type { AttachmentRow } from '../db/rows'
import type { DealRow } from '../db/sales-rows'
import { findRow } from '../lib/access'
import { buildClient, buildJob, insertClient, insertJob } from '../lib/create-records'
import { newId } from '../lib/ids'
import {
  conflict,
  created,
  FieldErrors,
  invalidField,
  MESSAGES,
  noContent,
  ok,
  validationWithCode,
} from '../lib/problems'
import { route } from '../lib/route'
import { openSales } from '../lib/sales/context'
import {
  activeStages,
  addActivity,
  buildBoard,
  checkDealVersion,
  dealMatches,
  getDealRow,
  stageOf,
  userActor,
  validateDealInput,
} from '../lib/sales/deals'
import { emitSales } from '../lib/sales/events'
import { presentActivity, presentDeal, presentDealSummary, isStale } from '../lib/sales/present'

const touch = (deal: DealRow, now = toIsoInstant(Date.now())) => {
  deal.version += 1
  deal.updatedAt = now
}

const told = (tenantId: string, dealId: string) => {
  emitSales(tenantId, { target: 'DealUpdated', payload: { dealId } })
}

const CHANGED_FIELDS = [
  'title',
  'clientId',
  'contactName',
  'contactEmail',
  'contactPhone',
  'value',
  'expectedCloseDate',
  'ownerUserId',
  'notes',
] as const

export const salesDealHandlers = [
  route<undefined, GetSalesBoardParams>('get', '/sales/board', ({ db, auth, query }) => {
    openSales(auth)
    return ok(buildBoard(db, auth, query))
  }),

  route<undefined, ListDealsParams>('get', '/sales/deals', ({ db, auth, query }) => {
    const { t, sales } = openSales(auth)
    const now = Date.now()
    const rows = sales.deals
      .filter((d) => !d.deletedAt)
      .filter((d) => !query.stageId || d.stageId === query.stageId)
      .filter((d) => !query.ownerUserId || d.ownerUserId === query.ownerUserId)
      .filter((d) => !query.clientId || d.clientId === query.clientId)
      .filter((d) => !query.status || stageOf(sales, d).kind === query.status)
      .filter((d) => query.stale === undefined || isStale(sales, d, now) === query.stale)
      .filter((d) => dealMatches(t, d, query.q))
      .map((d) => ({ row: d, summary: presentDealSummary(db, auth, d, now) }))
      .filter(
        ({ summary }) =>
          query.awaitingReply === undefined || summary.awaitingReply === query.awaitingReply,
      )
    const sort = query.sort ?? '-createdAt'
    const key = sort.replace(/^-/, '') as 'lastContactAt' | 'value' | 'createdAt'
    const valueOf = ({ row }: { row: DealRow }) =>
      key === 'value' ? Number(row.value ?? -1) : (row[key] ?? '')
    rows.sort((a, b) => {
      const x = valueOf(a)
      const y = valueOf(b)
      return typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x).localeCompare(String(y))
    })
    if (sort.startsWith('-')) rows.reverse()
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 50
    return ok({
      page,
      pageSize,
      totalCount: rows.length,
      items: rows.slice((page - 1) * pageSize, page * pageSize).map(({ summary }) => summary),
    })
  }),

  route<DealCreate>('post', '/sales/deals', ({ db, auth, body }) => {
    const { t, sales } = openSales(auth)
    const errors = new FieldErrors()
    const { stageId, fields } = validateDealInput(db, t, auth, body, errors, { forCreate: true })
    errors.throwIfAny()
    const now = toIsoInstant(Date.now())
    const deal: DealRow = {
      id: newId(),
      ...fields,
      stageId: stageId ?? '',
      source: body.source ?? 'manual',
      lostReason: null,
      lostNote: null,
      wonAt: null,
      lostAt: null,
      stageEnteredAt: now,
      lastContactAt: null,
      nextFollowUpAt: null,
      jobId: null,
      extracted: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    sales.deals.push(deal)
    addActivity(sales, deal.id, 'created', userActor(auth), { at: now })
    told(auth.tenantId, deal.id)
    return created(presentDeal(db, auth, deal))
  }),

  route('get', '/sales/deals/{id}', ({ db, auth, params }) => {
    const { sales } = openSales(auth)
    return ok(presentDeal(db, auth, getDealRow(sales, params.id)))
  }),

  route<DealUpdate>('put', '/sales/deals/{id}', ({ db, auth, body, params }) => {
    const { t, sales } = openSales(auth)
    const deal = getDealRow(sales, params.id)
    checkDealVersion(deal, body.version)
    const errors = new FieldErrors()
    // The stage is changed by /move, not here
    const { fields } = validateDealInput(db, t, auth, body, errors, { forCreate: false })
    errors.throwIfAny()
    const changed = CHANGED_FIELDS.filter((f) => (deal[f] ?? null) !== (fields[f] ?? null))
    Object.assign(deal, fields, { source: body.source ?? deal.source })
    deal.expectedCloseDate = fields.expectedCloseDate
    touch(deal)
    if (changed.length > 0) {
      addActivity(sales, deal.id, 'field_changed', userActor(auth), { data: { fields: changed } })
    }
    told(auth.tenantId, deal.id)
    return ok(presentDeal(db, auth, deal))
  }),

  route('delete', '/sales/deals/{id}', ({ auth, params }) => {
    const { sales } = openSales(auth)
    const deal = getDealRow(sales, params.id)
    // Linked threads are unlinked, not deleted
    for (const thread of sales.threads) if (thread.dealId === deal.id) thread.dealId = null
    deal.deletedAt = toIsoInstant(Date.now())
    told(auth.tenantId, deal.id)
    return noContent()
  }),

  route<DealMoveRequest>('post', '/sales/deals/{id}/move', ({ db, auth, body, params }) => {
    const { sales } = openSales(auth)
    const deal = getDealRow(sales, params.id)
    checkDealVersion(deal, body.version)
    const target = activeStages(sales).find((s) => s.id === body.stageId)
    if (!target) invalidField('stageId', MESSAGES.notFound)
    if (target.kind === 'lost' && !body.lostReason) {
      throw validationWithCode('sales.lost_reason_required', { lostReason: [MESSAGES.required] })
    }
    const from = deal.stageId
    if (from === target.id) return ok(presentDeal(db, auth, deal))
    const now = toIsoInstant(Date.now())
    deal.stageId = target.id
    deal.stageEnteredAt = now
    deal.wonAt = target.kind === 'won' ? now : null
    deal.lostAt = target.kind === 'lost' ? now : null
    deal.lostReason = target.kind === 'lost' ? (body.lostReason ?? null) : null
    deal.lostNote = target.kind === 'lost' ? (body.lostNote ?? null) : null
    // A closed deal has nothing left to follow up
    if (target.kind !== 'open') deal.nextFollowUpAt = null
    touch(deal, now)
    addActivity(sales, deal.id, 'stage_changed', userActor(auth), {
      at: now,
      data: { fromStageId: from, toStageId: target.id },
    })
    told(auth.tenantId, deal.id)
    return ok(presentDeal(db, auth, deal))
  }),

  route<DealConvertRequest>('post', '/sales/deals/{id}/convert', ({ db, auth, body, params }) => {
    const { t, sales } = openSales(auth)
    const deal = getDealRow(sales, params.id)
    if (deal.jobId)
      throw conflict('sales.deal_already_converted', 'The deal was already converted.')
    checkDealVersion(deal, body.version)

    const errors = new FieldErrors()
    const now = toIsoInstant(Date.now())
    // Validation of the pieces, with the paths of this request
    const nest = (prefix: string, inner: FieldErrors) => {
      for (const [path, messages] of Object.entries(inner.errors)) {
        for (const message of messages) errors.add(`${prefix}.${path}`, message)
      }
    }
    let clientId = body.clientId ?? null
    let locationId = body.locationId ?? null
    let built: ReturnType<typeof buildClient> | null = null
    if (clientId && body.newClient) {
      errors.add('newClient', MESSAGES.notAllowed)
    } else if (clientId) {
      const client = findRow(t.clients, clientId)
      if (!client) errors.add('clientId', MESSAGES.notFound)
      else if (locationId) {
        if (
          !findRow(t.locations, locationId)?.clientId ||
          findRow(t.locations, locationId)?.clientId !== client.id
        ) {
          errors.add('locationId', MESSAGES.notFound)
        }
      } else {
        locationId = t.locations.find((l) => l.clientId === client.id && !l.deletedAt)?.id ?? null
        if (!locationId) errors.add('locationId', MESSAGES.required)
      }
    } else if (body.newClient) {
      const inner = new FieldErrors()
      built = buildClient(t, body.newClient, inner, now)
      if (!built.location) inner.add('firstLocation', MESSAGES.required)
      nest('newClient', inner)
      clientId = built.client.id
      locationId = built.location?.id ?? null
    } else {
      errors.add('clientId', MESSAGES.required)
    }

    // The job is checked against the client and location it will have (a new client is
    // stored only when everything is valid)
    let builtJob: ReturnType<typeof buildJob> = null
    const newIds = built ? { client: built.client.id, location: built.location?.id } : null
    if (clientId && locationId) {
      if (built) insertClient(t, built)
      const inner = new FieldErrors()
      const jobBody: JobCreate = { ...body.job, clientId, locationId, source: 'email' }
      builtJob = buildJob(t, auth, jobBody, inner, now)
      nest('job', inner)
      if (newIds && !builtJob) {
        t.clients = t.clients.filter((c) => c.id !== newIds.client)
        t.contacts = t.contacts.filter((c) => c.clientId !== newIds.client)
        t.locations = t.locations.filter((l) => l.id !== newIds.location)
      }
    }
    errors.throwIfAny()
    if (!builtJob || !clientId || !locationId) invalidField('job', MESSAGES.invalid)

    insertJob(t, auth, builtJob.job, builtJob.jobType)
    // What was saved to the deal goes with it to the job
    const copies: AttachmentRow[] = t.attachments
      .filter((a) => a.ownerType === 'deal' && a.ownerId === deal.id && !a.deletedAt)
      .map((a) => ({ ...a, id: newId(), ownerType: 'job' as const, ownerId: builtJob.job.id }))
    t.attachments.push(...copies)

    deal.jobId = builtJob.job.id
    deal.clientId = clientId
    const actor = userActor(auth)
    if (body.markWon ?? true) {
      const won = activeStages(sales).find((s) => s.kind === 'won')
      if (won && deal.stageId !== won.id) {
        addActivity(sales, deal.id, 'stage_changed', actor, {
          at: now,
          data: { fromStageId: deal.stageId, toStageId: won.id },
        })
        deal.stageId = won.id
        deal.stageEnteredAt = now
        deal.wonAt = now
        deal.lostAt = null
        deal.lostReason = null
        deal.lostNote = null
        deal.nextFollowUpAt = null
      }
    }
    touch(deal, now)
    addActivity(sales, deal.id, 'converted', actor, {
      at: now,
      data: { jobId: builtJob.job.id, clientId, locationId },
    })
    for (const thread of sales.threads) if (thread.dealId === deal.id) thread.clientId = clientId
    told(auth.tenantId, deal.id)
    return created({
      deal: presentDeal(db, auth, deal),
      clientId,
      locationId,
      jobId: builtJob.job.id,
    })
  }),

  route('get', '/sales/deals/{id}/activities', ({ db, auth, params }) => {
    const { sales } = openSales(auth)
    const deal = getDealRow(sales, params.id)
    return ok(
      sales.activities
        .filter((a) => a.dealId === deal.id)
        .sort((a, b) => b.at.localeCompare(a.at))
        .map((a) => presentActivity(db, a)),
    )
  }),

  route<DealNoteInput>('post', '/sales/deals/{id}/notes', ({ db, auth, body, params }) => {
    const { sales } = openSales(auth)
    const deal = getDealRow(sales, params.id)
    const activity = addActivity(sales, deal.id, 'note', userActor(auth), {
      text: body.text.trim(),
    })
    deal.updatedAt = activity.at
    told(auth.tenantId, deal.id)
    return created(presentActivity(db, activity))
  }),

  route<FollowUpAction>('post', '/sales/deals/{id}/follow-up', ({ db, auth, body, params }) => {
    const { sales } = openSales(auth)
    const deal = getDealRow(sales, params.id)
    if ((body.action === 'snooze' || body.action === 'set') && !body.until) {
      invalidField('until', MESSAGES.required)
    }
    const actor = userActor(auth)
    const note = body.note ?? null
    const before = deal.nextFollowUpAt
    switch (body.action) {
      case 'done':
        deal.nextFollowUpAt = null
        deal.lastContactAt = toIsoInstant(Date.now())
        addActivity(sales, deal.id, 'follow_up_done', actor, { text: note })
        break
      case 'snooze':
        deal.nextFollowUpAt = body.until ?? null
        addActivity(sales, deal.id, 'follow_up_snoozed', actor, {
          text: note,
          data: { until: body.until },
        })
        break
      case 'set':
        deal.nextFollowUpAt = body.until ?? null
        addActivity(sales, deal.id, 'field_changed', actor, {
          text: note,
          data: { fields: ['nextFollowUpAt'], from: before, to: body.until },
        })
        break
      case 'clear':
        deal.nextFollowUpAt = null
        addActivity(sales, deal.id, 'field_changed', actor, {
          text: note,
          data: { fields: ['nextFollowUpAt'], from: before, to: null },
        })
        break
    }
    touch(deal)
    told(auth.tenantId, deal.id)
    return ok(presentDeal(db, auth, deal))
  }),
]
