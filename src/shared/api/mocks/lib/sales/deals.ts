import type { DealCreate, SalesBoard } from '@/shared/api/generated/model'
import { toIsoInstant } from '@/shared/lib/datetime'
import { normalizePhone } from '@/shared/lib/phone'

import type { MockDb, TenantData } from '../../db/rows'
import type { DealActivityRow, DealRow, SalesData, SalesStageRow } from '../../db/sales-rows'
import type { AuthContext } from '../auth'
import { newId } from '../ids'
import { tenantCountry } from '../inputs'
import { conflict, FieldErrors, MESSAGES, notFound } from '../problems'
import { matchesQuery } from '../text'
import { BOARD_CLOSED_DAYS, BOARD_DEFAULT_PER_STAGE } from './const'
import { presentDealSummary, presentStage } from './present'
import { sumMoney } from './money'

export const activeStages = (sales: SalesData): SalesStageRow[] =>
  sales.stages.filter((s) => s.isActive && !s.deletedAt).sort((a, b) => a.position - b.position)

export function getDealRow(sales: SalesData, id: string): DealRow {
  const deal = sales.deals.find((d) => d.id === id && !d.deletedAt)
  if (!deal) throw notFound()
  return deal
}

export function checkDealVersion(deal: DealRow, version: number | undefined): void {
  if (version !== undefined && version !== deal.version) {
    throw conflict('deal.version_conflict', 'The deal was changed by someone else.')
  }
}

export function stageOf(sales: SalesData, deal: DealRow): SalesStageRow {
  const stage = sales.stages.find((s) => s.id === deal.stageId)
  if (!stage) throw new Error(`Mock DB: stage ${deal.stageId} missing`)
  return stage
}

export function addActivity(
  sales: SalesData,
  dealId: string,
  type: DealActivityRow['type'],
  actor: { kind: DealActivityRow['actorKind']; userId?: string },
  fields: { text?: string | null; data?: Record<string, unknown>; at?: string } = {},
): DealActivityRow {
  const row: DealActivityRow = {
    id: newId(),
    dealId,
    type,
    actorKind: actor.kind,
    actorUserId: actor.userId ?? null,
    at: fields.at ?? toIsoInstant(Date.now()),
    text: fields.text ?? null,
    data: fields.data ?? {},
  }
  sales.activities.push(row)
  return row
}

export const userActor = (auth: AuthContext) => ({ kind: 'user' as const, userId: auth.user.id })

/** The fields a DealCreate/DealUpdate sets; collects 400 errors. */
export function validateDealInput(
  db: MockDb,
  t: TenantData,
  auth: AuthContext,
  body: DealCreate,
  errors: FieldErrors,
  { forCreate }: { forCreate: boolean },
) {
  const { sales } = t
  let stageId: string | undefined
  if (forCreate) {
    const open = activeStages(sales).filter((s) => s.kind === 'open')
    if (body.stageId) {
      // Won and lost go through /move (a lost stage needs a reason)
      const stage = open.find((s) => s.id === body.stageId)
      if (stage) stageId = stage.id
      else errors.add('stageId', MESSAGES.notFound)
    } else {
      stageId = open[0]?.id
      if (!stageId) errors.add('stageId', MESSAGES.required)
    }
  }
  if (body.clientId && !t.clients.some((c) => c.id === body.clientId && !c.deletedAt)) {
    errors.add('clientId', MESSAGES.notFound)
  }
  let phone: string | null = null
  if (body.contactPhone) {
    phone = normalizePhone(body.contactPhone, tenantCountry(t))
    if (!phone) errors.add('contactPhone', MESSAGES.invalidPhone)
  }
  const ownerUserId = body.ownerUserId ?? (forCreate ? auth.user.id : null)
  if (
    body.ownerUserId &&
    !db.memberships.some(
      (m) => m.tenantId === auth.tenantId && m.userId === body.ownerUserId && m.isActive,
    )
  ) {
    errors.add('ownerUserId', MESSAGES.notFound)
  }
  return {
    stageId,
    fields: {
      title: body.title.trim(),
      clientId: body.clientId ?? null,
      contactName: (body.contactName ?? '').trim() || null,
      contactEmail: body.contactEmail?.toLowerCase() ?? null,
      contactPhone: phone,
      value: body.value ?? null,
      expectedCloseDate: body.expectedCloseDate ?? null,
      ownerUserId,
      notes: body.notes ?? null,
    },
  }
}

/** The kanban: open stages in order, then won and lost (the last 30 days). */
export function buildBoard(
  db: MockDb,
  auth: AuthContext,
  filters: { ownerUserId?: string; q?: string; perStage?: number },
  now = Date.now(),
): SalesBoard {
  const { sales } = auth.t
  const stages = activeStages(sales)
  const ordered = [
    ...stages.filter((s) => s.kind === 'open'),
    ...stages.filter((s) => s.kind === 'won'),
    ...stages.filter((s) => s.kind === 'lost'),
  ]
  const since = now - BOARD_CLOSED_DAYS * 86_400_000
  const perStage = filters.perStage ?? BOARD_DEFAULT_PER_STAGE
  return {
    columns: ordered.map((stage) => {
      const deals = sales.deals
        .filter((d) => !d.deletedAt && d.stageId === stage.id)
        .filter((d) => !filters.ownerUserId || d.ownerUserId === filters.ownerUserId)
        .filter((d) => dealMatches(auth.t, d, filters.q))
        .filter((d) => {
          const closedAt = stage.kind === 'won' ? d.wonAt : stage.kind === 'lost' ? d.lostAt : null
          return stage.kind === 'open' || (closedAt !== null && Date.parse(closedAt) >= since)
        })
        .sort((a, b) =>
          (b.lastContactAt ?? b.createdAt).localeCompare(a.lastContactAt ?? a.createdAt),
        )
      return {
        stage: presentStage(stage),
        deals: deals.slice(0, perStage).map((d) => presentDealSummary(db, auth, d, now)),
        totalCount: deals.length,
        totalValue: sumMoney(deals.map((d) => d.value)),
      }
    }),
  }
}

/** `q` searches title, contact and client. */
export function dealMatches(t: TenantData, deal: DealRow, q: string | undefined): boolean {
  if (!q) return true
  const client = deal.clientId ? t.clients.find((c) => c.id === deal.clientId) : undefined
  return matchesQuery(q, [
    deal.title,
    deal.contactName,
    deal.contactEmail,
    deal.contactPhone,
    client?.name,
  ])
}
