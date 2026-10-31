/**
 * The mock's stand-in for the AI of the Sales module: a keyword classifier and a template
 * for drafts, with the delay and the monthly allowance of a real one. AI only suggests:
 * nothing here sends mail or moves a deal.
 */
import type {
  ExtractedContact,
  MailAddress,
  ThreadCategory,
  Usage,
} from '@/shared/api/generated/model'
import { normalizePhone } from '@/shared/lib/phone'
import { dateInTimeZone, toIsoInstant, zonedDateTimeToInstant } from '@/shared/lib/datetime'
import { addDays } from '@/shared/lib/datetime'

import { getDb } from '../../db'
import type { TenantData } from '../../db/rows'
import type { DraftRow, MailMessageRow, MailThreadRow, SalesData } from '../../db/sales-rows'
import { newId } from '../ids'
import { conflict, rateLimited } from '../problems'
import { hasAiFeature } from './access'
import { MOCK_AI_LATENCY_MS, MOCK_AI_MODEL, MOCK_AI_MONTHLY_LIMIT } from './const'
import { emitSales } from './events'

// --- the allowance ----------------------------------------------------------------

/** The month's usage row (made when missing), as the tenant's `/tenant/usage` shows it. */
export function usageOfMonth(t: TenantData, now = Date.now()): Usage {
  const month = toIsoInstant(now).slice(0, 7)
  let usage = t.usage.find((u) => u.month === month)
  if (!usage) {
    usage = {
      month,
      smsCount: 0,
      smsCost: '0.00',
      emailCount: 0,
      optimizationsCount: 0,
      aiClassifications: 0,
      aiDrafts: 0,
      aiInputTokens: 0,
      aiOutputTokens: 0,
    }
    t.usage.push(usage)
  }
  return usage
}

/** 409 `sales.ai_disabled` when the plan or the settings have AI off. */
export function requireAi(t: TenantData): void {
  if (!hasAiFeature(t) || !t.sales.settings.aiEnabled) {
    throw conflict('sales.ai_disabled', 'AI is switched off in the plan or in the settings.')
  }
}

/** 429 `sales.ai_quota_exceeded` with `Retry-After` (seconds) once the month's allowance is used. */
export function requireAiQuota(t: TenantData, now = Date.now()): void {
  const usage = usageOfMonth(t, now)
  if ((usage.aiClassifications ?? 0) + (usage.aiDrafts ?? 0) < MOCK_AI_MONTHLY_LIMIT) return
  const timeZone = t.tenant.timezone
  const today = dateInTimeZone(now, timeZone)
  const nextMonth = `${addDays(`${today.slice(0, 7)}-28`, 4).slice(0, 7)}-01`
  const retryAt = Date.parse(zonedDateTimeToInstant(nextMonth, '00:00', timeZone))
  throw rateLimited(
    'sales.ai_quota_exceeded',
    Math.max(1, Math.ceil((retryAt - now) / 1000)),
    'The monthly AI allowance is used up.',
  )
}

function countTokens(usage: Usage, input: string, output: string): void {
  usage.aiInputTokens = (usage.aiInputTokens ?? 0) + Math.ceil(input.length / 4)
  usage.aiOutputTokens = (usage.aiOutputTokens ?? 0) + Math.ceil(output.length / 4)
}

// --- classification ---------------------------------------------------------------

const SALES_CATEGORIES: readonly ThreadCategory[] = [
  'new_inquiry',
  'quote_request',
  'follow_up',
  'negotiation',
  'objection',
  'accepted',
  'declined',
]

const RULES: { category: ThreadCategory; confidence: number; words: string[] }[] = [
  {
    category: 'spam',
    confidence: 0.95,
    words: ['newsletter', 'unsubscribe', 'odjava s popisa', 'akcija do'],
  },
  { category: 'admin', confidence: 0.9, words: ['račun br', 'uplat', 'faktur', 'ugovor o'] },
  {
    category: 'support',
    confidence: 0.88,
    words: ['reklamacij', 'kvar', 'ne radi', 'hitno', 'problem'],
  },
  {
    category: 'accepted',
    confidence: 0.92,
    words: ['prihvaćam', 'prihvaćamo', 'slažemo se', 'potvrđujem ponudu'],
  },
  {
    category: 'declined',
    confidence: 0.9,
    words: ['odustajem', 'odustajemo', 'ne treba nam', 'ne trebamo'],
  },
  {
    category: 'objection',
    confidence: 0.82,
    words: ['preskupo', 'skupo', 'jeftinije', 'drugi ponuditelj'],
  },
  {
    category: 'negotiation',
    confidence: 0.8,
    words: ['popust', 'rok isporuke', 'uvjeti plaćanja', 'pregovar'],
  },
  {
    category: 'quote_request',
    confidence: 0.9,
    words: ['ponud', 'koliko košta', 'cijena', 'troškovnik'],
  },
  {
    category: 'new_inquiry',
    confidence: 0.85,
    words: ['zanima me', 'zanima nas', 'upit', 'interesira'],
  },
  {
    category: 'follow_up',
    confidence: 0.75,
    words: ['javljam se ponovno', 'podsjećam', 'jeste li stigli'],
  },
]

const NEXT_ACTION: Partial<Record<ThreadCategory, string>> = {
  new_inquiry: 'Odgovori na upit i dogovori razgovor.',
  quote_request: 'Pošalji ponudu.',
  follow_up: 'Javi se klijentu.',
  negotiation: 'Odgovori na uvjete i pošalji izmijenjenu ponudu.',
  objection: 'Odgovori na primjedbu klijenta.',
  accepted: 'Potvrdi dogovor i pokreni nalog.',
  declined: 'Zahvali klijentu i zatvori priliku.',
}

/** The text an AI would read: the subject and the stored bodies of the thread. */
function threadText(thread: MailThreadRow, messages: MailMessageRow[]): string {
  return [thread.subject, ...messages.map((m) => m.bodyText ?? m.snippet)].join('\n').toLowerCase()
}

export interface Classification {
  category: ThreadCategory
  confidence: number
  isSales: boolean
  summary: string
  nextAction: string | null
  suggestedStageId: string | null
  extracted: ExtractedContact
}

export function classify(
  sales: SalesData,
  thread: MailThreadRow,
  messages: MailMessageRow[],
  country: Parameters<typeof normalizePhone>[1],
): Classification {
  const text = threadText(thread, messages)
  const hit = RULES.find((rule) => rule.words.some((word) => text.includes(word)))
  const category: ThreadCategory = hit?.category ?? 'other'
  const confidence = hit?.confidence ?? 0.52
  const lastInbound = messages.filter((m) => m.direction === 'inbound').at(-1)
  const sentence = (lastInbound?.bodyText ?? lastInbound?.snippet ?? thread.subject)
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s/)[0]
    ?.slice(0, 160)
  const phone = /\+?\d[\d /-]{7,}\d/.exec(lastInbound?.bodyText ?? '')?.[0]
  const open = sales.stages
    .filter((s) => s.kind === 'open' && s.isActive && !s.deletedAt)
    .sort((a, b) => a.position - b.position)
  const stageOfKind = (kind: 'won' | 'lost') =>
    sales.stages.find((s) => s.kind === kind && s.isActive && !s.deletedAt)
  const suggested =
    category === 'accepted'
      ? stageOfKind('won')
      : category === 'declined'
        ? stageOfKind('lost')
        : category === 'quote_request' || category === 'negotiation'
          ? (open[2] ?? open.at(-1))
          : category === 'new_inquiry'
            ? open[0]
            : undefined
  return {
    category,
    confidence,
    isSales: SALES_CATEGORIES.includes(category),
    summary: sentence !== undefined && sentence !== '' ? sentence : thread.subject,
    nextAction: NEXT_ACTION[category] ?? null,
    suggestedStageId: suggested?.id ?? null,
    extracted: {
      name: lastInbound?.from.name ?? null,
      email: lastInbound?.from.email ?? null,
      phone: phone ? normalizePhone(phone, country) : null,
      request: sentence ?? null,
    },
  }
}

// --- generating ---------------------------------------------------------------------

const GREETING = { formal: 'Poštovani,', neutral: 'Poštovani,', friendly: 'Bok,' } as const
const CLOSING = {
  formal: 'S poštovanjem,',
  neutral: 'Lijep pozdrav,',
  friendly: 'Lijep pozdrav,',
} as const

/** Who a reply goes to: whoever wrote last from outside (else the first outside address). */
export function replyRecipients(
  messages: MailMessageRow[],
  ownAddresses: Set<string>,
): MailAddress[] {
  const lastInbound = messages.filter((m) => m.direction === 'inbound').at(-1)
  if (lastInbound) return [lastInbound.from]
  const external = messages.flatMap((m) => m.to).find((address) => !ownAddresses.has(address.email))
  return external ? [external] : []
}

export function draftBody(
  settings: SalesData['settings'],
  kind: 'reply' | 'follow_up',
  instructions: string | null,
): string {
  const opening =
    kind === 'follow_up'
      ? 'javljamo se u vezi naše prethodne poruke. Jeste li stigli razmotriti ponudu?'
      : 'hvala na vašoj poruci.'
  return [
    GREETING[settings.tone],
    '',
    opening,
    ...(instructions?.trim() ? ['', instructions.trim()] : []),
    '',
    CLOSING[settings.tone],
    (settings.signature ?? '').trim(),
  ]
    .join('\n')
    .trimEnd()
}

export const replySubject = (subject: string) =>
  /^re:/i.test(subject) ? subject : `Re: ${subject}`

// --- finishing what takes time -----------------------------------------------------------

/**
 * Classifications and drafts that were due by now finish: the thread gets its result, the
 * draft its text, and the hub tells the tenant (`SalesThreadUpdated`, `DraftReady`).
 * Called before every Sales request; in the browser a timer calls it when something falls due.
 */
export function settleDue(tenantId: string, t: TenantData, now = Date.now()): void {
  const { sales } = t
  for (const thread of sales.threads) {
    if (thread.aiStatus !== 'pending' || !thread.aiReadyAt || Date.parse(thread.aiReadyAt) > now)
      continue
    const messages = sales.messages
      .filter((m) => m.threadId === thread.id)
      .sort((a, b) => a.sentAt.localeCompare(b.sentAt))
    const result = classify(sales, thread, messages, undefined)
    if (thread.categorySource !== 'user') {
      thread.category = result.category
      thread.categorySource = 'ai'
      thread.confidence = result.confidence
      thread.isSales = result.isSales
    }
    thread.summary = result.summary
    thread.nextAction = result.nextAction
    thread.suggestedStageId = result.suggestedStageId
    thread.extracted = result.extracted
    thread.aiModel = MOCK_AI_MODEL
    thread.aiProcessedAt = toIsoInstant(Date.parse(thread.aiReadyAt))
    thread.aiStatus = 'done'
    thread.aiReadyAt = null
    thread.updatedAt = toIsoInstant(now)
    countTokens(usageOfMonth(t, now), threadText(thread, messages), result.summary)
    emitSales(tenantId, {
      target: 'SalesThreadUpdated',
      payload: { threadId: thread.id, dealId: thread.dealId },
    })
  }
  for (const draft of sales.drafts) {
    if (draft.status !== 'generating' || !draft.readyAt || Date.parse(draft.readyAt) > now) continue
    draft.status = 'ready'
    draft.aiModel = MOCK_AI_MODEL
    draft.readyAt = null
    draft.updatedAt = toIsoInstant(now)
    countTokens(usageOfMonth(t, now), draft.instructions ?? draft.subject, draft.bodyText)
    emitSales(tenantId, {
      target: 'DraftReady',
      payload: { draftId: draft.id, threadId: draft.threadId, status: draft.status },
    })
  }
}

/** True when the thread's AI result is still on its way. */
export const isProcessing = (thread: MailThreadRow) =>
  thread.aiStatus === 'pending' && thread.aiReadyAt !== null

/**
 * In the browser the result must reach open screens by itself, so a timer settles the
 * tenant when the delay is over. Tests call `settleDue` with a clock of their own.
 */
export function scheduleSettle(tenantId: string): void {
  if (import.meta.env.MODE === 'test') return
  setTimeout(() => {
    const t = getDb().tenants[tenantId]
    if (t) settleDue(tenantId, t)
  }, MOCK_AI_LATENCY_MS + 50)
}

export const aiReadyAt = (now = Date.now()) => toIsoInstant(now + MOCK_AI_LATENCY_MS)

export function newDraftRow(fields: Omit<DraftRow, 'id' | 'version' | 'deletedAt'>): DraftRow {
  return { id: newId(), version: 1, deletedAt: null, ...fields }
}
