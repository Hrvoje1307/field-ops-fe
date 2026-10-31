/**
 * Stored Sales rows → API responses. A user only ever sees what their mailboxes show:
 * counts, snippets and "awaiting reply" are worked out from the visible messages.
 */
import type {
  AiClassification,
  Deal,
  DealActivity,
  DealSummary,
  Draft,
  ExclusionRule,
  FollowUpRule,
  MailAddress,
  Mailbox,
  MailMessage,
  MailThread,
  MailThreadSummary,
  SalesSettings,
  SalesStage,
  UserBrief,
} from '@/shared/api/generated/model'

import type { MockDb, TenantData } from '../../db/rows'
import type {
  DealActivityRow,
  DealRow,
  DraftRow,
  ExclusionRuleRow,
  FollowUpRuleRow,
  MailboxRow,
  MailThreadRow,
  SalesData,
  SalesStageRow,
} from '../../db/sales-rows'
import type { AuthContext } from '../auth'
import { canSeeMailbox, visibleMailboxIds, visibleMessages } from './access'

export function userBrief(db: MockDb, userId: string | null): UserBrief | null {
  const user = userId ? db.users.find((u) => u.id === userId) : undefined
  return user ? { id: user.id, fullName: user.fullName } : null
}

const timestamps = (row: { createdAt: string; updatedAt: string }) => ({
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

// --- mailboxes ---------------------------------------------------------------

export function presentMailbox(db: MockDb, row: MailboxRow): Mailbox {
  return {
    id: row.id,
    provider: row.provider,
    emailAddress: row.emailAddress,
    displayName: row.displayName,
    kind: row.kind,
    owner: userBrief(db, row.ownerUserId),
    status: row.status,
    lastSyncedAt: row.lastSyncedAt,
    lastError: row.lastError,
    syncFrom: row.syncFrom,
    canSend: row.canSend,
    ...timestamps(row),
  }
}

// --- stages, rules, settings ---------------------------------------------------

export const presentStage = (row: SalesStageRow): SalesStage => ({
  id: row.id,
  name: row.name,
  color: row.color,
  position: row.position,
  kind: row.kind,
  followUpDays: row.followUpDays,
  staleAfterDays: row.staleAfterDays,
  isActive: row.isActive,
})

export const presentRule = (row: FollowUpRuleRow): FollowUpRule => ({
  id: row.id,
  name: row.name,
  stageId: row.stageId,
  daysWithoutReply: row.daysWithoutReply,
  createDraft: row.createDraft,
  isActive: row.isActive,
})

export const presentExclusion = (row: ExclusionRuleRow): ExclusionRule => ({
  id: row.id,
  pattern: row.pattern,
  note: row.note,
  createdAt: row.createdAt,
})

export const presentSettings = (row: SalesData['settings']): SalesSettings => ({
  aiEnabled: row.aiEnabled,
  signature: row.signature,
  tone: row.tone,
  replyLanguage: row.replyLanguage,
  knowledge: row.knowledge,
  responseSlaHours: row.responseSlaHours,
  digestEnabled: row.digestEnabled,
  digestTime: row.digestTime,
  digestRecipientIds: row.digestRecipientIds,
  storeNonSalesBodies: row.storeNonSalesBodies,
  retentionDays: row.retentionDays,
  reviewThreshold: row.reviewThreshold,
})

// --- threads ---------------------------------------------------------------------

const unique = (addresses: MailAddress[]): MailAddress[] => {
  const seen = new Map<string, MailAddress>()
  for (const address of addresses) {
    if (!seen.has(address.email))
      seen.set(address.email, { email: address.email, name: address.name ?? null })
  }
  return [...seen.values()]
}

/** Existing client matched by the thread's client id, else by a participant's e-mail. */
function matchedClient(t: TenantData, row: MailThreadRow, participants: MailAddress[]) {
  const byId = row.clientId
    ? t.clients.find((c) => c.id === row.clientId && !c.deletedAt)
    : undefined
  if (byId) return { id: byId.id, name: byId.name }
  const emails = new Set(participants.map((p) => p.email))
  const contact = t.contacts.find(
    (c) => !c.deletedAt && c.email && emails.has(c.email.toLowerCase()),
  )
  const client = contact && t.clients.find((c) => c.id === contact.clientId && !c.deletedAt)
  return client ? { id: client.id, name: client.name } : null
}

/** The AI's result, or null while there is none. */
function presentClassification(t: TenantData, row: MailThreadRow): AiClassification | null {
  if (row.category === null) return null
  return {
    category: row.category,
    source: row.categorySource ?? 'ai',
    isSales: row.isSales ?? false,
    confidence: row.confidence,
    summary: row.summary,
    nextAction: row.nextAction,
    suggestedStageId:
      row.suggestedStageId &&
      t.sales.stages.some((s) => s.id === row.suggestedStageId && !s.deletedAt)
        ? row.suggestedStageId
        : null,
    extracted: row.extracted ?? undefined,
    model: row.aiModel,
    processedAt: row.aiProcessedAt,
  }
}

/** The thread as the caller sees it; null when none of its mailboxes show it. */
export function presentThreadSummary(
  auth: AuthContext,
  row: MailThreadRow,
): MailThreadSummary | null {
  const t = auth.t
  const visible = visibleMailboxIds(auth, t.sales)
  const messages = visibleMessages(t.sales, row, visible)
  const last = messages.at(-1)
  if (!last) return null
  const shown =
    t.sales.mailboxes.find((m) => m.id === row.shownMailboxId && visible.has(m.id)) ??
    t.sales.mailboxes.find(
      (m) => row.mailboxIds.includes(m.id) && visible.has(m.id) && m.kind === 'shared',
    ) ??
    t.sales.mailboxes.find((m) => row.mailboxIds.includes(m.id) && visible.has(m.id))
  if (!shown) return null

  const participants = unique(messages.flatMap((m) => [m.from, ...m.to, ...m.cc]))
  const classification = presentClassification(t, row)
  const deal = row.dealId
    ? t.sales.deals.find((d) => d.id === row.dealId && !d.deletedAt)
    : undefined
  const lastOf = (direction: 'inbound' | 'outbound') =>
    messages.filter((m) => m.direction === direction).at(-1)?.sentAt ?? null
  return {
    id: row.id,
    mailbox: { id: shown.id, emailAddress: shown.emailAddress, kind: shown.kind },
    subject: row.subject,
    participants,
    snippet: last.snippet,
    messageCount: messages.length,
    lastMessageAt: last.sentAt,
    lastInboundAt: lastOf('inbound'),
    lastOutboundAt: lastOf('outbound'),
    awaitingReply: last.direction === 'inbound',
    hasAttachments: messages.some((m) => m.attachments.length > 0),
    aiStatus: row.aiStatus,
    classification,
    needsReview: needsReview(t.sales, row),
    deal: deal ? { id: deal.id, title: deal.title } : null,
    client: matchedClient(t, row, participants),
  }
}

/** AI confidence below the review threshold and no user correction yet. */
export function needsReview(sales: SalesData, row: MailThreadRow): boolean {
  return (
    row.category !== null &&
    row.categorySource === 'ai' &&
    row.confidence !== null &&
    row.confidence < sales.settings.reviewThreshold &&
    !row.excluded
  )
}

export function presentMessage(row: ReturnType<typeof visibleMessages>[number]): MailMessage {
  return {
    id: row.id,
    direction: row.direction,
    from: row.from,
    to: row.to,
    cc: row.cc,
    subject: row.subject,
    sentAt: row.sentAt,
    snippet: row.snippet,
    bodyText: row.bodyText,
    attachments: row.attachments,
  }
}

export function presentThread(
  db: MockDb,
  auth: AuthContext,
  row: MailThreadRow,
): MailThread | null {
  const summary = presentThreadSummary(auth, row)
  if (!summary) return null
  const t = auth.t
  const visible = visibleMailboxIds(auth, t.sales)
  return {
    ...summary,
    messages: visibleMessages(t.sales, row, visible).map(presentMessage),
    drafts: t.sales.drafts
      .filter(
        (d) =>
          d.threadId === row.id &&
          !d.deletedAt &&
          d.status !== 'discarded' &&
          visible.has(d.mailboxId),
      )
      .map((d) => presentDraft(db, d)),
    mailboxes: t.sales.mailboxes
      .filter((m) => row.mailboxIds.includes(m.id) && !m.deletedAt && visible.has(m.id))
      .map((m) => ({ id: m.id, emailAddress: m.emailAddress, kind: m.kind, canSend: m.canSend })),
  }
}

// --- deals -----------------------------------------------------------------------

/** The last thing that happened to the deal, for "days without activity". */
export function lastActivityAt(sales: SalesData, deal: DealRow): string {
  const times = sales.activities.filter((a) => a.dealId === deal.id).map((a) => a.at)
  return [deal.updatedAt, deal.createdAt, ...times].sort().at(-1) ?? deal.createdAt
}

/** Open deal without any activity for `staleAfterDays` of its stage. */
export function isStale(sales: SalesData, deal: DealRow, now: number): boolean {
  const stage = sales.stages.find((s) => s.id === deal.stageId)
  if (!stage?.staleAfterDays || stage.kind !== 'open') return false
  return now - Date.parse(lastActivityAt(sales, deal)) > stage.staleAfterDays * 86_400_000
}

export function presentDealSummary(
  db: MockDb,
  auth: AuthContext,
  row: DealRow,
  now = Date.now(),
): DealSummary {
  const t = auth.t
  const stage = t.sales.stages.find((s) => s.id === row.stageId)
  if (!stage) throw new Error(`Mock DB: stage ${row.stageId} missing`)
  const client = row.clientId
    ? t.clients.find((c) => c.id === row.clientId && !c.deletedAt)
    : undefined
  const threads = t.sales.threads
    .filter((th) => th.dealId === row.id && !th.deletedAt)
    .map((th) => presentThreadSummary(auth, th))
    .filter((th): th is MailThreadSummary => th !== null)
  return {
    id: row.id,
    title: row.title,
    stage: { id: stage.id, name: stage.name, color: stage.color, kind: stage.kind },
    client: client ? { id: client.id, name: client.name } : null,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    value: row.value,
    owner: userBrief(db, row.ownerUserId),
    lastContactAt: row.lastContactAt,
    nextFollowUpAt: row.nextFollowUpAt,
    awaitingReply: stage.kind === 'open' && threads.some((th) => th.awaitingReply),
    isStale: isStale(t.sales, row, now),
    threadCount: threads.length,
    createdAt: row.createdAt,
  }
}

export function presentDeal(db: MockDb, auth: AuthContext, row: DealRow): Deal {
  const t = auth.t
  const threads = t.sales.threads
    .filter((th) => th.dealId === row.id && !th.deletedAt)
    .map((th) => presentThreadSummary(auth, th))
    .filter((th): th is MailThreadSummary => th !== null)
  return {
    ...presentDealSummary(db, auth, row),
    updatedAt: row.updatedAt,
    source: row.source,
    expectedCloseDate: row.expectedCloseDate,
    notes: row.notes,
    lostReason: row.lostReason,
    lostNote: row.lostNote,
    wonAt: row.wonAt,
    lostAt: row.lostAt,
    jobId: row.jobId,
    extracted: row.extracted,
    threads,
    version: row.version,
  }
}

export function presentActivity(db: MockDb, row: DealActivityRow): DealActivity {
  return {
    id: row.id,
    type: row.type,
    actorKind: row.actorKind,
    actor: userBrief(db, row.actorUserId),
    at: row.at,
    text: row.text,
    data: row.data,
  }
}

// --- drafts ----------------------------------------------------------------------

export function presentDraft(db: MockDb, row: DraftRow): Draft {
  return {
    id: row.id,
    threadId: row.threadId,
    dealId: row.dealId,
    mailboxId: row.mailboxId,
    kind: row.kind,
    status: row.status,
    subject: row.subject,
    bodyText: row.bodyText,
    to: row.to,
    cc: row.cc,
    instructions: row.instructions,
    error: row.error,
    aiModel: row.aiModel,
    createdBy: userBrief(db, row.createdByUserId),
    sentAt: row.sentAt,
    version: row.version,
    ...timestamps(row),
  }
}

/** Visible mailbox rows that are connected (the list endpoint). */
export const connectedMailboxes = (auth: AuthContext, sales: SalesData) =>
  sales.mailboxes.filter((m) => !m.deletedAt && canSeeMailbox(auth, m))
