/**
 * The daily list of GET /sales/today (spec): follow-ups due, unanswered inquiries, stale
 * deals, with the draft that is waiting. Overdue items come first, then by due time.
 */
import type {
  DealSummary,
  MailThreadSummary,
  SalesToday,
  SalesTodayItem,
  TodayReason,
} from '@/shared/api/generated/model'
import {
  addDays,
  dateInTimeZone,
  zonedDateTimeToInstant,
  toIsoInstant,
} from '@/shared/lib/datetime'

import type { MockDb } from '../../db/rows'
import type { DealRow, MailThreadRow } from '../../db/sales-rows'
import type { AuthContext } from '../auth'
import { visibleMailboxIds } from './access'
import { addBusinessDays } from './business-days'
import {
  isStale,
  lastActivityAt,
  needsReview,
  presentDealSummary,
  presentDraft,
  presentMailbox,
  presentThreadSummary,
} from './present'

/** Whose work the list shows. `undefined` = everyone (owners only). */
export type TodayScope = { ownerUserId: string } | undefined

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

const byDueTime = (now: number) => (a: SalesTodayItem, b: SalesTodayItem) => {
  const aOverdue = a.dueAt != null && Date.parse(a.dueAt) < now
  const bOverdue = b.dueAt != null && Date.parse(b.dueAt) < now
  if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
  return (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999')
}

export const sortTodayItems = (items: SalesTodayItem[], now: number): SalesTodayItem[] =>
  [...items].sort(byDueTime(now))

export function buildToday(
  db: MockDb,
  auth: AuthContext,
  scope: TodayScope,
  now = Date.now(),
): SalesToday {
  const t = auth.t
  const { sales } = t
  const tz = t.tenant.timezone
  const date = dateInTimeZone(now, tz)
  const endOfToday = Date.parse(zonedDateTimeToInstant(addDays(date, 1), '00:00', tz))
  const visible = visibleMailboxIds(auth, sales)

  const dealById = new Map(sales.deals.filter((d) => !d.deletedAt).map((d) => [d.id, d]))
  const inScope = (thread: MailThreadRow, deal: DealRow | undefined): boolean => {
    if (!scope) return true
    if (deal?.ownerUserId) return deal.ownerUserId === scope.ownerUserId
    // Not assigned to anyone: shared-mailbox conversations
    const shown = sales.mailboxes.find((m) => m.id === thread.shownMailboxId)
    return shown?.kind === 'shared'
  }

  const candidates = sales.threads
    .filter((th) => !th.deletedAt && !th.excluded && th.isSales !== false)
    .flatMap((thread) => {
      const summary = presentThreadSummary(auth, thread)
      if (!summary) return []
      const deal = thread.dealId ? dealById.get(thread.dealId) : undefined
      return inScope(thread, deal) ? [{ thread, summary, deal }] : []
    })

  const draftOf = (threadId: string, kind: 'reply' | 'follow_up') => {
    const open = sales.drafts
      .filter(
        (d) =>
          d.threadId === threadId &&
          !d.deletedAt &&
          visible.has(d.mailboxId) &&
          ['ready', 'edited', 'saved_to_mailbox'].includes(d.status),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const draft = open.find((d) => d.kind === kind) ?? open[0]
    return draft ? presentDraft(db, draft) : null
  }

  const items: SalesTodayItem[] = []
  const taken = new Set<string>()
  const push = (
    reason: TodayReason,
    summary: MailThreadSummary,
    deal: DealRow | undefined,
    dueAt: string,
    kind: 'reply' | 'follow_up',
  ) => {
    taken.add(summary.id)
    items.push({
      reason,
      thread: summary,
      deal: deal ? presentDealSummary(db, auth, deal, now) : null,
      dueAt,
      draft: draftOf(summary.id, kind),
    })
  }

  // follow_up_due: the deal's own date, or a rule (business days after our last message with no answer)
  for (const { summary, deal } of candidates) {
    if (!deal) continue
    const stage = sales.stages.find((s) => s.id === deal.stageId)
    if (stage?.kind !== 'open') continue
    const dues: number[] = []
    if (deal.nextFollowUpAt) dues.push(Date.parse(deal.nextFollowUpAt))
    if (summary.lastOutboundAt && !summary.awaitingReply) {
      for (const rule of sales.followUpRules) {
        if (!rule.isActive || rule.deletedAt) continue
        if (rule.stageId && rule.stageId !== deal.stageId) continue
        dues.push(Date.parse(addBusinessDays(summary.lastOutboundAt, rule.daysWithoutReply, tz)))
      }
    }
    const due = dues.length ? Math.min(...dues) : undefined
    if (due !== undefined && due < endOfToday) {
      push('follow_up_due', summary, deal, toIsoInstant(due), 'follow_up')
    }
  }

  // unanswered: the client wrote last and the answer is due (response time of the settings)
  for (const { summary, deal } of candidates) {
    if (taken.has(summary.id) || !summary.awaitingReply || !summary.lastInboundAt) continue
    // A closed deal has nothing left to answer
    if (deal && sales.stages.find((s) => s.id === deal.stageId)?.kind !== 'open') continue
    if (summary.classification?.isSales !== true) continue
    const due = Date.parse(summary.lastInboundAt) + sales.settings.responseSlaHours * HOUR_MS
    if (due < endOfToday) push('unanswered', summary, deal, toIsoInstant(due), 'reply')
  }

  // stale: an open deal nobody touched for too long (also listed in staleDeals)
  const staleRows = sales.deals.filter(
    (d) =>
      !d.deletedAt && isStale(sales, d, now) && (!scope || d.ownerUserId === scope.ownerUserId),
  )
  for (const { summary, deal } of candidates) {
    if (!deal || taken.has(summary.id) || !staleRows.includes(deal)) continue
    const stage = sales.stages.find((s) => s.id === deal.stageId)
    const since = Date.parse(lastActivityAt(sales, deal)) + (stage?.staleAfterDays ?? 0) * DAY_MS
    push('stale', summary, deal, toIsoInstant(since), 'follow_up')
  }

  const staleDeals: DealSummary[] = staleRows
    .sort((a, b) => lastActivityAt(sales, a).localeCompare(lastActivityAt(sales, b)))
    .map((d) => presentDealSummary(db, auth, d, now))

  const reviewCount = sales.threads.filter(
    (th) =>
      !th.deletedAt &&
      th.isSales !== false &&
      needsReview(sales, th) &&
      presentThreadSummary(auth, th) !== null,
  ).length

  return {
    date,
    items: sortTodayItems(items, now),
    staleDeals,
    needsReviewCount: reviewCount,
    mailboxesNeedingAttention: sales.mailboxes
      .filter(
        (m) =>
          !m.deletedAt &&
          visible.has(m.id) &&
          (m.status === 'needs_reauth' || m.status === 'error'),
      )
      .map((m) => presentMailbox(db, m)),
  }
}
