import type { DealSource, LostReason, SalesReport } from '@/shared/api/generated/model'

import type { MockDb } from '../../db/rows'
import type { AuthContext } from '../auth'
import { visibleMailboxIds, visibleMessages } from './access'
import { sumMoney } from './money'
import { activeStages } from './deals'

export interface ReportRange {
  from: string
  to: string
  startMs: number
  /** Exclusive. */
  endMs: number
}

const DAY_MS = 86_400_000
const SOURCES: DealSource[] = ['email', 'phone', 'manual', 'web']

const median = (values: number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? (sorted[mid] ?? null)
    : Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2)
}

export function buildReport(
  _db: MockDb,
  auth: AuthContext,
  range: ReportRange,
  ownerUserId: string | undefined,
): SalesReport {
  const { sales } = auth.t
  const inRange = (iso: string | null) =>
    iso !== null && Date.parse(iso) >= range.startMs && Date.parse(iso) < range.endMs
  const deals = sales.deals.filter(
    (d) => !d.deletedAt && (!ownerUserId || d.ownerUserId === ownerUserId),
  )
  const created = deals.filter((d) => inRange(d.createdAt))
  const won = deals.filter((d) => inRange(d.wonAt))
  const lost = deals.filter((d) => inRange(d.lostAt))
  const openIds = new Set(sales.stages.filter((s) => s.kind === 'open').map((s) => s.id))

  // Time to first answer: first inbound message to the first outbound one after it
  const visible = visibleMailboxIds(auth, sales)
  const minutes: number[] = []
  for (const thread of sales.threads) {
    if (thread.deletedAt || thread.isSales !== true) continue
    const messages = visibleMessages(sales, thread, visible)
    const first = messages.find((m) => m.direction === 'inbound')
    if (!first || !inRange(first.sentAt)) continue
    const answer = messages.find((m) => m.direction === 'outbound' && m.sentAt > first.sentAt)
    if (answer)
      minutes.push(Math.round((Date.parse(answer.sentAt) - Date.parse(first.sentAt)) / 60_000))
  }

  // Days a deal stayed in a stage before it moved on
  const durations = new Map<string, number[]>()
  for (const deal of deals) {
    const changes = sales.activities
      .filter((a) => a.dealId === deal.id && a.type === 'stage_changed')
      .sort((a, b) => a.at.localeCompare(b.at))
    let enteredAt = deal.createdAt
    for (const change of changes) {
      const fromId = change.data.fromStageId
      const from = typeof fromId === 'string' ? fromId : ''
      if (inRange(change.at) && from) {
        const list = durations.get(from) ?? []
        list.push((Date.parse(change.at) - Date.parse(enteredAt)) / DAY_MS)
        durations.set(from, list)
      }
      enteredAt = change.at
    }
  }

  const reasons = new Map<LostReason, number>()
  for (const deal of lost) {
    if (deal.lostReason) reasons.set(deal.lostReason, (reasons.get(deal.lostReason) ?? 0) + 1)
  }

  return {
    from: range.from,
    to: range.to,
    dealsCreated: created.length,
    dealsWon: won.length,
    dealsLost: lost.length,
    winRate: won.length + lost.length === 0 ? null : won.length / (won.length + lost.length),
    openValue: sumMoney(deals.filter((d) => openIds.has(d.stageId)).map((d) => d.value)),
    wonValue: sumMoney(won.map((d) => d.value)),
    medianFirstResponseMinutes: median(minutes),
    stageTimes: activeStages(sales).map((stage) => {
      const list = durations.get(stage.id) ?? []
      const avg = list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0
      return { stageId: stage.id, name: stage.name, avgDays: Math.round(avg * 10) / 10 }
    }),
    lostReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })),
    bySource: SOURCES.map((source) => ({
      source,
      created: created.filter((d) => d.source === source).length,
      won: won.filter((d) => d.source === source).length,
    })),
  }
}
