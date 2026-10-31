import type {
  ClassificationUpdate,
  DraftCreateRequest,
  ListMailThreadsParams,
  SaveAttachmentRequest,
  ThreadExcludeRequest,
  ThreadLinkRequest,
} from '@/shared/api/generated/model'
import { toIsoInstant } from '@/shared/lib/datetime'

import type { AttachmentRow } from '../db/rows'
import type { MailThreadRow } from '../db/sales-rows'
import { newId } from '../lib/ids'
import { matchesQuery } from '../lib/text'
import { presentAttachment } from '../lib/present'
import {
  conflict,
  created,
  FieldErrors,
  invalidField,
  MESSAGES,
  notFound,
  ok,
} from '../lib/problems'
import { route } from '../lib/route'
import { getVisibleThread, visibleMailboxIds, visibleMessages } from '../lib/sales/access'
import {
  aiReadyAt,
  draftBody,
  newDraftRow,
  replyRecipients,
  replySubject,
  requireAi,
  requireAiQuota,
  scheduleSettle,
  usageOfMonth,
} from '../lib/sales/ai'
import { openSales } from '../lib/sales/context'
import { addActivity, userActor, validateDealInput, activeStages } from '../lib/sales/deals'
import { emitSales } from '../lib/sales/events'
import {
  needsReview,
  presentDraft,
  presentThread,
  presentThreadSummary,
} from '../lib/sales/present'

const PATTERN = /^(@[a-z0-9.-]+\.[a-z]{2,}|[^\s@]+@[^\s@]+\.[^\s@]+)$/

const touch = (thread: MailThreadRow) => {
  thread.updatedAt = toIsoInstant(Date.now())
}

export const salesThreadHandlers = [
  route<undefined, ListMailThreadsParams>('get', '/sales/threads', ({ auth, query }) => {
    const { sales } = openSales(auth)
    const visible = visibleMailboxIds(auth, sales)
    const rows = sales.threads
      .filter((th) => !th.deletedAt)
      .filter((th) => !query.mailboxId || th.mailboxIds.includes(query.mailboxId))
      .filter(
        (th) => !query.category || (th.category !== null && query.category.includes(th.category)),
      )
      // Non-sales threads are returned only with isSales=false
      .filter((th) =>
        query.isSales === undefined ? th.isSales !== false : th.isSales === query.isSales,
      )
      .filter(
        (th) => query.needsReview === undefined || needsReview(sales, th) === query.needsReview,
      )
      .filter((th) => !query.dealId || th.dealId === query.dealId)
      .filter((th) => !query.unlinked || (th.isSales === true && th.dealId === null))
      .flatMap((th) => {
        const summary = presentThreadSummary(auth, th)
        return summary ? [{ th, summary }] : []
      })
      .filter(
        ({ summary }) =>
          query.awaitingReply === undefined || summary.awaitingReply === query.awaitingReply,
      )
      .filter(
        ({ th, summary }) =>
          !query.q ||
          matchesQuery(query.q, [
            summary.subject,
            ...summary.participants.flatMap((p) => [p.email, p.name]),
            ...visibleMessages(sales, th, visible).map((m) => m.bodyText ?? m.snippet),
          ]),
      )
      .map(({ summary }) => summary)
    rows.sort((a, b) => a.lastMessageAt.localeCompare(b.lastMessageAt))
    if (query.sort !== 'lastMessageAt') rows.reverse()
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 50
    return ok({
      page,
      pageSize,
      totalCount: rows.length,
      items: rows.slice((page - 1) * pageSize, page * pageSize),
    })
  }),

  route('get', '/sales/threads/{id}', ({ db, auth, params }) => {
    const { sales } = openSales(auth)
    const thread = getVisibleThread(auth, sales, params.id)
    const presented = presentThread(db, auth, thread)
    if (!presented) throw notFound()
    return ok(presented)
  }),

  route<ClassificationUpdate>(
    'put',
    '/sales/threads/{id}/classification',
    ({ auth, body, params }) => {
      const { sales } = openSales(auth)
      const thread = getVisibleThread(auth, sales, params.id)
      // The correction is kept as an example for later classification in this tenant
      sales.aiFeedback.push(
        {
          id: newId(),
          threadId: thread.id,
          field: 'category',
          aiValue: thread.category,
          userValue: body.category,
          userId: auth.user.id,
          createdAt: toIsoInstant(Date.now()),
        },
        {
          id: newId(),
          threadId: thread.id,
          field: 'is_sales',
          aiValue: thread.isSales === null ? null : String(thread.isSales),
          userValue: String(body.isSales),
          userId: auth.user.id,
          createdAt: toIsoInstant(Date.now()),
        },
      )
      thread.category = body.category
      thread.categorySource = 'user'
      thread.confidence = null
      thread.isSales = body.isSales
      if (thread.aiStatus === 'pending' || thread.aiStatus === 'failed') thread.aiStatus = 'skipped'
      touch(thread)
      emitSales(auth.tenantId, {
        target: 'SalesThreadUpdated',
        payload: { threadId: thread.id, dealId: thread.dealId },
      })
      const summary = presentThreadSummary(auth, thread)
      if (!summary) throw notFound()
      return ok(summary)
    },
  ),

  route('post', '/sales/threads/{id}/reprocess', ({ auth, params }) => {
    const { t, sales } = openSales(auth)
    const thread = getVisibleThread(auth, sales, params.id)
    requireAi(t)
    requireAiQuota(t)
    const usage = usageOfMonth(t)
    usage.aiClassifications = (usage.aiClassifications ?? 0) + 1
    thread.aiStatus = 'pending'
    thread.aiReadyAt = aiReadyAt()
    touch(thread)
    scheduleSettle(auth.tenantId)
    emitSales(auth.tenantId, {
      target: 'SalesThreadUpdated',
      payload: { threadId: thread.id, dealId: thread.dealId },
    })
    return { status: 202 }
  }),

  route<ThreadLinkRequest>('post', '/sales/threads/{id}/link', ({ db, auth, body, params }) => {
    const { t, sales } = openSales(auth)
    const thread = getVisibleThread(auth, sales, params.id)
    const hasDealId = 'dealId' in body
    const hasCreate = body.createDeal !== undefined && body.createDeal !== null
    if (hasCreate && body.dealId) {
      const errors = new FieldErrors()
      errors.add('dealId', MESSAGES.notAllowed)
      errors.add('createDeal', MESSAGES.notAllowed)
      errors.throwIfAny()
    }
    if (!hasDealId && !hasCreate) invalidField('dealId', MESSAGES.required)

    const previousId = thread.dealId
    const now = toIsoInstant(Date.now())
    let target: string | null = null
    if (body.createDeal) {
      const errors = new FieldErrors()
      const { stageId, fields } = validateDealInput(db, t, auth, body.createDeal, errors, {
        forCreate: true,
      })
      errors.throwIfAny()
      const stage = stageId ?? activeStages(sales)[0]?.id
      if (!stage) throw notFound()
      const last = visibleMessages(sales, thread, visibleMailboxIds(auth, sales)).at(-1)
      const deal = {
        id: newId(),
        ...fields,
        stageId: stage,
        source: body.createDeal.source ?? 'email',
        lostReason: null,
        lostNote: null,
        wonAt: null,
        lostAt: null,
        stageEnteredAt: now,
        lastContactAt: last?.sentAt ?? null,
        nextFollowUpAt: null,
        jobId: null,
        extracted: thread.extracted,
        version: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }
      sales.deals.push(deal)
      addActivity(sales, deal.id, 'created', userActor(auth), { data: { threadId: thread.id } })
      target = deal.id
    } else if (body.dealId) {
      const deal = sales.deals.find((d) => d.id === body.dealId && !d.deletedAt)
      if (!deal) invalidField('dealId', MESSAGES.notFound)
      target = deal.id
    }

    if (previousId && previousId !== target) {
      addActivity(sales, previousId, 'thread_unlinked', userActor(auth), {
        data: { threadId: thread.id },
      })
      emitSales(auth.tenantId, { target: 'DealUpdated', payload: { dealId: previousId } })
    }
    thread.dealId = target
    if (target) {
      const deal = sales.deals.find((d) => d.id === target)
      if (deal?.clientId) thread.clientId = deal.clientId
      if (previousId !== target) {
        addActivity(sales, target, 'thread_linked', userActor(auth), {
          data: { threadId: thread.id },
        })
      }
      emitSales(auth.tenantId, { target: 'DealUpdated', payload: { dealId: target } })
    }
    touch(thread)
    emitSales(auth.tenantId, {
      target: 'SalesThreadUpdated',
      payload: { threadId: thread.id, dealId: thread.dealId },
    })
    const summary = presentThreadSummary(auth, thread)
    if (!summary) throw notFound()
    return ok(summary)
  }),

  route<ThreadExcludeRequest>('post', '/sales/threads/{id}/exclude', ({ auth, body, params }) => {
    const { sales } = openSales(auth)
    const thread = getVisibleThread(auth, sales, params.id)
    const visible = visibleMailboxIds(auth, sales)
    const own = new Set(sales.mailboxes.map((m) => m.emailAddress))
    const messages = visibleMessages(sales, thread, visible)
    // Default: the thread's external sender
    const sender =
      messages.find((m) => m.direction === 'inbound' && !own.has(m.from.email))?.from.email ??
      messages.flatMap((m) => m.to).find((a) => !own.has(a.email))?.email
    const pattern = (body.pattern ?? sender ?? '').trim().toLowerCase()
    if (!PATTERN.test(pattern)) invalidField('pattern', MESSAGES.invalidFormat)

    let rule = sales.exclusions.find((r) => r.pattern === pattern)
    if (!rule) {
      rule = { id: newId(), pattern, note: null, createdAt: toIsoInstant(Date.now()) }
      sales.exclusions.push(rule)
    }
    const matches = (th: MailThreadRow) =>
      sales.messages.some(
        (m) =>
          m.threadId === th.id &&
          m.direction === 'inbound' &&
          (pattern.startsWith('@') ? m.from.email.endsWith(pattern) : m.from.email === pattern),
      )
    for (const th of sales.threads) {
      if (th.deletedAt || !matches(th)) continue
      th.excluded = true
      th.isSales = false
      if (body.purge ?? true) {
        // Stored bodies and the classification of matching threads are deleted
        for (const m of sales.messages) if (m.threadId === th.id) m.bodyText = null
        th.category = null
        th.categorySource = null
        th.confidence = null
        th.summary = null
        th.nextAction = null
        th.suggestedStageId = null
        th.extracted = null
      }
      touch(th)
      emitSales(auth.tenantId, {
        target: 'SalesThreadUpdated',
        payload: { threadId: th.id, dealId: th.dealId },
      })
    }
    return created({
      id: rule.id,
      pattern: rule.pattern,
      note: rule.note,
      createdAt: rule.createdAt,
    })
  }),

  route<SaveAttachmentRequest>(
    'post',
    '/sales/threads/{id}/attachments',
    ({ auth, body, params }) => {
      const { t, sales } = openSales(auth)
      const thread = getVisibleThread(auth, sales, params.id)
      const messages = visibleMessages(sales, thread, visibleMailboxIds(auth, sales))
      const message = messages.find((m) => m.id === body.messageId)
      const part = message?.attachments.find((a) => a.partId === body.partId)
      const errors = new FieldErrors()
      if (!message) errors.add('messageId', MESSAGES.notFound)
      else if (!part) errors.add('partId', MESSAGES.notFound)
      errors.throwIfAny()
      if (!thread.dealId || !part) {
        throw conflict('thread.not_linked', 'The thread is not linked to a deal.')
      }
      const existing = part.savedAttachmentId
        ? t.attachments.find((a) => a.id === part.savedAttachmentId && !a.deletedAt)
        : undefined
      if (existing) return created(presentAttachment(existing))
      const row: AttachmentRow = {
        id: newId(),
        ownerType: 'deal',
        ownerId: thread.dealId,
        kind: part.mime.startsWith('image/')
          ? 'photo'
          : part.mime === 'application/pdf'
            ? 'pdf'
            : 'doc',
        fileName: part.fileName,
        mime: part.mime,
        sizeBytes: part.sizeBytes,
        takenAt: null,
        createdAt: toIsoInstant(Date.now()),
        deletedAt: null,
        state: 'confirmed',
        availableAt: null,
        preview: null,
      }
      t.attachments.push(row)
      part.savedAttachmentId = row.id
      emitSales(auth.tenantId, { target: 'DealUpdated', payload: { dealId: thread.dealId } })
      return created(presentAttachment(row))
    },
  ),

  route<DraftCreateRequest>('post', '/sales/threads/{id}/drafts', ({ db, auth, body, params }) => {
    const { t, sales } = openSales(auth)
    const thread = getVisibleThread(auth, sales, params.id)
    const visible = visibleMailboxIds(auth, sales)
    // Send from one of the thread's mailboxes the caller can see (the thread's own by default)
    const options = sales.mailboxes.filter(
      (m) => !m.deletedAt && thread.mailboxIds.includes(m.id) && visible.has(m.id),
    )
    const mailbox = body.mailboxId
      ? options.find((m) => m.id === body.mailboxId)
      : (options.find((m) => m.id === thread.shownMailboxId) ?? options[0])
    if (!mailbox) invalidField('mailboxId', MESSAGES.notAllowed)
    requireAi(t)
    if (mailbox.status === 'needs_reauth') {
      throw conflict('sales.mailbox_needs_reauth', 'The mailbox has to be connected again.')
    }
    if (!mailbox.canSend) throw conflict('mailbox.cannot_send', 'This mailbox cannot send.')
    requireAiQuota(t)

    const messages = visibleMessages(sales, thread, visible)
    const own = new Set(sales.mailboxes.map((m) => m.emailAddress))
    const now = Date.now()
    const draft = newDraftRow({
      threadId: thread.id,
      dealId: thread.dealId,
      mailboxId: mailbox.id,
      kind: body.kind,
      status: 'generating',
      subject: replySubject(thread.subject),
      bodyText: draftBody(sales.settings, body.kind, body.instructions ?? null),
      to: replyRecipients(messages, own),
      cc: [],
      instructions: body.instructions ?? null,
      error: null,
      aiModel: null,
      followUpRuleId: null,
      providerDraftId: null,
      sentAt: null,
      readyAt: aiReadyAt(now),
      createdByUserId: auth.user.id,
      createdAt: toIsoInstant(now),
      updatedAt: toIsoInstant(now),
    })
    sales.drafts.push(draft)
    const usage = usageOfMonth(t, now)
    usage.aiDrafts = (usage.aiDrafts ?? 0) + 1
    if (thread.dealId) {
      addActivity(sales, thread.dealId, 'draft_created', userActor(auth), {
        data: { threadId: thread.id, draftId: draft.id },
      })
      emitSales(auth.tenantId, { target: 'DealUpdated', payload: { dealId: thread.dealId } })
    }
    scheduleSettle(auth.tenantId)
    // 202: the draft is "generating"; DraftReady is pushed when it is done
    return { status: 202, body: presentDraft(db, draft) }
  }),
]
