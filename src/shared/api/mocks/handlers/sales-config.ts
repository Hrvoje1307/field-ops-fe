import type {
  ExclusionRuleInput,
  FollowUpRuleInput,
  ListSalesStagesParams,
  SalesSettings,
  SalesStageInput,
  StageOrder,
} from '@/shared/api/generated/model'
import { toIsoInstant } from '@/shared/lib/datetime'

import { newId } from '../lib/ids'
import {
  conflict,
  created,
  FieldErrors,
  invalidField,
  MESSAGES,
  noContent,
  notFound,
  ok,
} from '../lib/problems'
import { route } from '../lib/route'
import { openSales } from '../lib/sales/context'
import { activeStages } from '../lib/sales/deals'
import { presentExclusion, presentRule, presentSettings, presentStage } from '../lib/sales/present'
import { assertWonAndLost, checkStageName, fromInput, renumber } from '../lib/sales/stages'

const sortedStages = (rows: ReturnType<typeof activeStages>) =>
  [...rows].sort((a, b) => a.position - b.position)

const EXCLUSION_PATTERN = /^(@[a-z0-9.-]+\.[a-z]{2,}|[^\s@]+@[^\s@]+\.[^\s@]+)$/

export const salesConfigHandlers = [
  // --- settings ---------------------------------------------------------------------
  route('get', '/sales/settings', ({ auth }) =>
    ok(presentSettings(openSales(auth).sales.settings)),
  ),

  route<SalesSettings>('put', '/sales/settings', ({ db, auth, body }) => {
    const { sales } = openSales(auth, { ownerOnly: true })
    const errors = new FieldErrors()
    for (const [index, id] of (body.digestRecipientIds ?? []).entries()) {
      const member = db.memberships.some(
        (m) => m.tenantId === auth.tenantId && m.userId === id && m.isActive,
      )
      if (!member) errors.add(`digestRecipientIds[${String(index)}]`, MESSAGES.notFound)
    }
    errors.throwIfAny()
    sales.settings = {
      aiEnabled: body.aiEnabled,
      signature: body.signature ?? null,
      tone: body.tone,
      replyLanguage: body.replyLanguage,
      knowledge: body.knowledge ?? null,
      responseSlaHours: body.responseSlaHours,
      digestEnabled: body.digestEnabled,
      digestTime: body.digestTime,
      digestRecipientIds: body.digestRecipientIds ?? [],
      storeNonSalesBodies: body.storeNonSalesBodies,
      retentionDays: body.retentionDays ?? null,
      // Omitted: the default of the spec
      reviewThreshold: body.reviewThreshold ?? 0.7,
    }
    return ok(presentSettings(sales.settings))
  }),

  // --- stages -------------------------------------------------------------------------
  route<undefined, ListSalesStagesParams>('get', '/sales/stages', ({ auth, query }) => {
    const { sales } = openSales(auth)
    const rows = sales.stages.filter(
      (s) => !s.deletedAt && ((query.includeInactive ?? false) || s.isActive),
    )
    return ok(sortedStages(rows).map(presentStage))
  }),

  route<SalesStageInput>('post', '/sales/stages', ({ auth, body }) => {
    const { sales } = openSales(auth, { ownerOnly: true })
    const errors = new FieldErrors()
    checkStageName(sales, body, errors)
    errors.throwIfAny()
    // A tenant has one active won and one active lost stage; a second would break that,
    // and this operation has no 409 in the contract
    if (
      body.kind !== 'open' &&
      body.isActive &&
      sales.stages.some((s) => !s.deletedAt && s.isActive && s.kind === body.kind)
    ) {
      invalidField('kind', MESSAGES.notAllowed)
    }
    // Appended before the won and lost stages
    const live = sortedStages(sales.stages.filter((s) => !s.deletedAt))
    const row = { id: newId(), position: 0, deletedAt: null, ...fromInput(body) }
    const firstClosed = live.findIndex((s) => s.kind !== 'open')
    live.splice(body.kind === 'open' && firstClosed >= 0 ? firstClosed : live.length, 0, row)
    sales.stages.push(row)
    renumber(live)
    return created(presentStage(row))
  }),

  route<StageOrder>('put', '/sales/stages/order', ({ auth, body }) => {
    const { sales } = openSales(auth, { ownerOnly: true })
    const live = sales.stages.filter((s) => !s.deletedAt)
    const ids = new Set(body.stageIds)
    if (
      ids.size !== body.stageIds.length ||
      live.length !== ids.size ||
      !live.every((s) => ids.has(s.id))
    ) {
      invalidField('stageIds', MESSAGES.notAllowed)
    }
    renumber(
      body.stageIds.map((id) => live.find((s) => s.id === id)).filter((s) => s !== undefined),
    )
    return ok(sortedStages(live).map(presentStage))
  }),

  route<SalesStageInput>('put', '/sales/stages/{id}', ({ auth, body, params }) => {
    const { sales } = openSales(auth, { ownerOnly: true })
    const row = sales.stages.find((s) => s.id === params.id && !s.deletedAt)
    if (!row) throw notFound()
    const errors = new FieldErrors()
    checkStageName(sales, body, errors, row.id)
    errors.throwIfAny()
    const before = { ...row }
    Object.assign(row, fromInput(body))
    try {
      assertWonAndLost(sales)
    } catch (error) {
      Object.assign(row, before)
      throw error
    }
    return ok(presentStage(row))
  }),

  route('delete', '/sales/stages/{id}', ({ auth, params }) => {
    const { sales } = openSales(auth, { ownerOnly: true })
    const row = sales.stages.find((s) => s.id === params.id && !s.deletedAt)
    if (!row) throw notFound()
    if (sales.deals.some((d) => !d.deletedAt && d.stageId === row.id)) {
      throw conflict('sales.stage_in_use', 'Deals are still in this stage; deactivate it instead.')
    }
    row.deletedAt = toIsoInstant(Date.now())
    try {
      assertWonAndLost(sales)
    } catch (error) {
      row.deletedAt = null
      throw error
    }
    // Rules for this stage go with it
    for (const rule of sales.followUpRules)
      if (rule.stageId === row.id) rule.deletedAt = row.deletedAt
    renumber(sortedStages(sales.stages.filter((s) => !s.deletedAt)))
    return noContent()
  }),

  // --- follow-up rules ------------------------------------------------------------------
  route('get', '/sales/follow-up-rules', ({ auth }) => {
    const { sales } = openSales(auth)
    return ok(sales.followUpRules.filter((r) => !r.deletedAt).map(presentRule))
  }),

  route<FollowUpRuleInput>('post', '/sales/follow-up-rules', ({ auth, body }) => {
    const { sales } = openSales(auth, { ownerOnly: true })
    checkRuleStage(auth, body)
    const row = { id: newId(), deletedAt: null, ...ruleFields(body) }
    sales.followUpRules.push(row)
    return created(presentRule(row))
  }),

  route<FollowUpRuleInput>('put', '/sales/follow-up-rules/{id}', ({ auth, body, params }) => {
    const { sales } = openSales(auth, { ownerOnly: true })
    const row = sales.followUpRules.find((r) => r.id === params.id && !r.deletedAt)
    if (!row) throw notFound()
    checkRuleStage(auth, body)
    Object.assign(row, ruleFields(body))
    return ok(presentRule(row))
  }),

  route('delete', '/sales/follow-up-rules/{id}', ({ auth, params }) => {
    const { sales } = openSales(auth, { ownerOnly: true })
    const row = sales.followUpRules.find((r) => r.id === params.id && !r.deletedAt)
    if (!row) throw notFound()
    row.deletedAt = toIsoInstant(Date.now())
    return noContent()
  }),

  // --- exclusions -------------------------------------------------------------------------
  route('get', '/sales/exclusions', ({ auth }) => {
    const { sales } = openSales(auth)
    return ok(
      [...sales.exclusions]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(presentExclusion),
    )
  }),

  route<ExclusionRuleInput>('post', '/sales/exclusions', ({ auth, body }) => {
    const { sales } = openSales(auth, { ownerOnly: true })
    const pattern = body.pattern.trim().toLowerCase()
    if (!EXCLUSION_PATTERN.test(pattern)) invalidField('pattern', MESSAGES.invalidFormat)
    if (sales.exclusions.some((r) => r.pattern === pattern))
      invalidField('pattern', MESSAGES.duplicate)
    const row = {
      id: newId(),
      pattern,
      note: body.note ?? null,
      createdAt: toIsoInstant(Date.now()),
    }
    sales.exclusions.push(row)
    return created(presentExclusion(row))
  }),

  route('delete', '/sales/exclusions/{id}', ({ auth, params }) => {
    const { sales } = openSales(auth, { ownerOnly: true })
    const index = sales.exclusions.findIndex((r) => r.id === params.id)
    if (index < 0) throw notFound()
    sales.exclusions.splice(index, 1)
    return noContent()
  }),
]

function ruleFields(body: FollowUpRuleInput) {
  return {
    name: body.name.trim(),
    stageId: body.stageId ?? null,
    daysWithoutReply: body.daysWithoutReply,
    createDraft: body.createDraft,
    isActive: body.isActive,
  }
}

/** A rule's stage is one of the open stages (`null` = all of them). */
function checkRuleStage(auth: Parameters<typeof openSales>[0], body: FollowUpRuleInput): void {
  if (!body.stageId) return
  const stage = auth.t.sales.stages.find((s) => s.id === body.stageId && !s.deletedAt)
  if (stage?.kind !== 'open') invalidField('stageId', MESSAGES.notFound)
}
