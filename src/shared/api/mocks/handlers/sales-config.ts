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

// The pattern of `ExclusionRuleInput`, word for word
const EXCLUSION_PATTERN = /^(@[^@\s]+\.[^@\s]+|[^@\s]+@[^@\s]+\.[^@\s]+)$/
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/

export const salesConfigHandlers = [
  // --- settings ---------------------------------------------------------------------
  route('get', '/sales/settings', ({ auth }) =>
    ok(presentSettings(openSales(auth).sales.settings)),
  ),

  route<SalesSettings>('put', '/sales/settings', ({ db, auth, body }) => {
    const { sales } = openSales(auth, { ownerOnly: true })
    const errors = new FieldErrors()
    checkSettings(body, errors)
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
    checkRule(body)
    checkRuleStage(auth, body)
    const row = { id: newId(), deletedAt: null, ...ruleFields(body) }
    sales.followUpRules.push(row)
    return created(presentRule(row))
  }),

  route<FollowUpRuleInput>('put', '/sales/follow-up-rules/{id}', ({ auth, body, params }) => {
    const { sales } = openSales(auth, { ownerOnly: true })
    const row = sales.followUpRules.find((r) => r.id === params.id && !r.deletedAt)
    if (!row) throw notFound()
    checkRule(body)
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

/** The ranges and formats of `SalesSettings`. */
function checkSettings(body: SalesSettings, errors: FieldErrors): void {
  if (!['formal', 'neutral', 'friendly'].includes(body.tone))
    errors.add('tone', MESSAGES.notAllowed)
  if (typeof body.replyLanguage !== 'string' || body.replyLanguage.trim() === '') {
    errors.add('replyLanguage', MESSAGES.required)
  } else if (body.replyLanguage !== 'auto') {
    try {
      if (Intl.getCanonicalLocales(body.replyLanguage).length !== 1) throw new RangeError()
    } catch {
      errors.add('replyLanguage', MESSAGES.invalidFormat)
    }
  }
  if ((body.knowledge?.length ?? 0) > 20_000) errors.add('knowledge', MESSAGES.maxLength(20_000))
  const sla = body.responseSlaHours
  if (!Number.isInteger(sla) || sla < 1) errors.add('responseSlaHours', MESSAGES.minimum(1))
  else if (sla > 168) errors.add('responseSlaHours', MESSAGES.maximum(168))
  if (!TIME_OF_DAY.test(body.digestTime)) errors.add('digestTime', MESSAGES.invalidFormat)
  if (
    body.retentionDays != null &&
    (!Number.isInteger(body.retentionDays) || body.retentionDays < 30)
  )
    errors.add('retentionDays', MESSAGES.minimum(30))
  const threshold = body.reviewThreshold
  if (threshold !== undefined && (typeof threshold !== 'number' || threshold < 0 || threshold > 1))
    errors.add('reviewThreshold', MESSAGES.invalid)
}

/** The name and the range of days of `FollowUpRuleInput`. */
function checkRule(body: FollowUpRuleInput): void {
  const errors = new FieldErrors()
  if (typeof body.name !== 'string' || body.name.trim() === '')
    errors.add('name', MESSAGES.required)
  const days = body.daysWithoutReply
  if (!Number.isInteger(days) || days < 1) errors.add('daysWithoutReply', MESSAGES.minimum(1))
  else if (days > 90) errors.add('daysWithoutReply', MESSAGES.maximum(90))
  errors.throwIfAny()
}

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
