import type { DraftUpdate, ListDraftsParams, SendDraftBody } from '@/shared/api/generated/model'
import { toIsoInstant } from '@/shared/lib/datetime'

import type { DraftRow, SalesData } from '../db/sales-rows'
import type { AuthContext } from '../lib/auth'
import { newId } from '../lib/ids'
import { conflict, FieldErrors, MESSAGES, noContent, notFound, ok } from '../lib/problems'
import { route } from '../lib/route'
import { visibleMailboxIds } from '../lib/sales/access'
import { openSales } from '../lib/sales/context'
import { addActivity, userActor } from '../lib/sales/deals'
import { emitSales } from '../lib/sales/events'
import { presentDraft } from '../lib/sales/present'

const DEFAULT_STATUSES = ['generating', 'ready', 'edited']

function getDraft(auth: AuthContext, sales: SalesData, id: string): DraftRow {
  const draft = sales.drafts.find((d) => d.id === id && !d.deletedAt && d.status !== 'discarded')
  if (!draft || !visibleMailboxIds(auth, sales).has(draft.mailboxId)) throw notFound()
  return draft
}

/** A draft that was sent can no longer change; one still being written cannot be edited or sent yet. */
function requireOpen(draft: DraftRow): void {
  if (draft.status === 'sent') throw conflict('draft.already_sent', 'The draft was already sent.')
  if (draft.status === 'generating')
    throw conflict('draft.not_ready', 'The draft is still being written.')
}

function requireMailbox(sales: SalesData, draft: DraftRow): void {
  const mailbox = sales.mailboxes.find((m) => m.id === draft.mailboxId)
  if (!mailbox || mailbox.deletedAt)
    throw conflict('mailbox.cannot_send', 'The mailbox is not connected.')
  if (mailbox.status === 'needs_reauth') {
    throw conflict('sales.mailbox_needs_reauth', 'The mailbox has to be connected again.')
  }
  if (!mailbox.canSend) throw conflict('mailbox.cannot_send', 'This mailbox cannot send.')
}

function checkVersion(draft: DraftRow, version: number | undefined): void {
  if (version !== undefined && version !== draft.version) {
    throw conflict('draft.version_conflict', 'The draft was changed by someone else.')
  }
}

const touch = (draft: DraftRow, now = toIsoInstant(Date.now())) => {
  draft.version += 1
  draft.updatedAt = now
}

export const salesDraftHandlers = [
  route<undefined, ListDraftsParams>('get', '/sales/drafts', ({ db, auth, query }) => {
    const { sales } = openSales(auth)
    const visible = visibleMailboxIds(auth, sales)
    const statuses = query.status ?? DEFAULT_STATUSES
    return ok(
      sales.drafts
        .filter((d) => !d.deletedAt && visible.has(d.mailboxId))
        .filter((d) => statuses.includes(d.status))
        .filter((d) => !query.dealId || d.dealId === query.dealId)
        .filter((d) => !query.threadId || d.threadId === query.threadId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((d) => presentDraft(db, d)),
    )
  }),

  route('get', '/sales/drafts/{id}', ({ db, auth, params }) => {
    const { sales } = openSales(auth)
    return ok(presentDraft(db, getDraft(auth, sales, params.id)))
  }),

  route<DraftUpdate>('put', '/sales/drafts/{id}', ({ db, auth, body, params }) => {
    const { sales } = openSales(auth)
    const draft = getDraft(auth, sales, params.id)
    requireOpen(draft)
    checkVersion(draft, body.version)
    draft.subject = body.subject
    draft.bodyText = body.bodyText
    draft.to = body.to
    draft.cc = body.cc
    draft.status = 'edited'
    touch(draft)
    return ok(presentDraft(db, draft))
  }),

  route('delete', '/sales/drafts/{id}', ({ auth, params }) => {
    const { sales } = openSales(auth)
    const draft = getDraft(auth, sales, params.id)
    // The draft kept in the real mailbox goes too
    draft.providerDraftId = null
    draft.status = 'discarded'
    touch(draft)
    return noContent()
  }),

  route('post', '/sales/drafts/{id}/save-to-mailbox', ({ db, auth, params }) => {
    const { sales } = openSales(auth)
    const draft = getDraft(auth, sales, params.id)
    requireOpen(draft)
    requireMailbox(sales, draft)
    draft.providerDraftId ??= `provider-${newId()}`
    draft.status = 'saved_to_mailbox'
    touch(draft)
    return ok(presentDraft(db, draft))
  }),

  route<SendDraftBody>('post', '/sales/drafts/{id}/send', ({ db, auth, body, params }) => {
    const { sales } = openSales(auth)
    const draft = getDraft(auth, sales, params.id)
    requireOpen(draft)
    checkVersion(draft, body.version)
    const errors = new FieldErrors()
    if (draft.to.length === 0) errors.add('to', MESSAGES.required)
    if (draft.subject.trim() === '') errors.add('subject', MESSAGES.required)
    if (draft.bodyText.trim() === '') errors.add('bodyText', MESSAGES.required)
    errors.throwIfAny()
    requireMailbox(sales, draft)

    const mailbox = sales.mailboxes.find((m) => m.id === draft.mailboxId)
    const thread = sales.threads.find((th) => th.id === draft.threadId)
    if (!mailbox || !thread) throw notFound()
    const now = toIsoInstant(Date.now())
    const messageId = newId()
    sales.messages.push({
      id: messageId,
      threadId: thread.id,
      // Sent from this mailbox only: a reply from a personal inbox stays private
      mailboxIds: [mailbox.id],
      direction: 'outbound',
      from: { email: mailbox.emailAddress, name: mailbox.displayName },
      to: draft.to,
      cc: draft.cc,
      subject: draft.subject,
      sentAt: now,
      snippet: draft.bodyText.replace(/\s+/g, ' ').slice(0, 140),
      bodyText: draft.bodyText,
      attachments: [],
    })
    if (!thread.mailboxIds.includes(mailbox.id)) thread.mailboxIds.push(mailbox.id)
    thread.updatedAt = now
    draft.status = 'sent'
    draft.sentAt = now
    touch(draft, now)
    if (draft.dealId) {
      const deal = sales.deals.find((d) => d.id === draft.dealId && !d.deletedAt)
      if (deal) {
        deal.lastContactAt = now
        deal.updatedAt = now
        deal.version += 1
        addActivity(sales, deal.id, 'draft_sent', userActor(auth), {
          at: now,
          data: { threadId: thread.id, draftId: draft.id },
        })
        addActivity(sales, deal.id, 'email_out', userActor(auth), {
          at: now,
          data: { threadId: thread.id, messageId },
        })
        emitSales(auth.tenantId, { target: 'DealUpdated', payload: { dealId: deal.id } })
      }
    }
    emitSales(auth.tenantId, {
      target: 'SalesThreadUpdated',
      payload: { threadId: thread.id, dealId: thread.dealId },
    })
    return ok(presentDraft(db, draft))
  }),
]
