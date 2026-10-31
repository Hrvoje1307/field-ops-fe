import { toIsoInstant, addDays, zonedDateTimeToInstant } from '@/shared/lib/datetime'

import type { ClientRow, ContactRow, JobRow, UserRow } from '../db/rows'
import type {
  DealActivityRow,
  DealRow,
  DraftRow,
  MailMessageRow,
  MailThreadRow,
  SalesData,
  SalesSettingsRow,
  SalesStageRow,
} from '../db/sales-rows'
import { MOCK_AI_MODEL } from '../lib/sales/const'
import type { SalesSeed } from './types'

const HOUR = 3_600_000
const DAY = 86_400_000

const DEFAULT_SETTINGS: SalesSettingsRow = {
  aiEnabled: true,
  signature: null,
  tone: 'neutral',
  replyLanguage: 'auto',
  knowledge: null,
  responseSlaHours: 4,
  digestEnabled: true,
  digestTime: '07:45',
  digestRecipientIds: [],
  storeNonSalesBodies: false,
  retentionDays: null,
  reviewThreshold: 0.7,
}

export function emptySales(): SalesData {
  return {
    mailboxes: [],
    oauthStates: [],
    stages: [],
    deals: [],
    activities: [],
    threads: [],
    messages: [],
    drafts: [],
    exclusions: [],
    followUpRules: [],
    settings: { ...DEFAULT_SETTINGS },
    aiFeedback: [],
  }
}

const SALES_CATEGORIES = new Set([
  'new_inquiry',
  'quote_request',
  'follow_up',
  'negotiation',
  'objection',
  'accepted',
  'declined',
])

interface Context {
  id: () => string
  today: string
  timeZone: string
  user: (key: string) => UserRow
  clients: ClientRow[]
  clientKeys: string[]
  contacts: ContactRow[]
  jobs: JobRow[]
  /** The user a deal belongs to unless the seed says otherwise. */
  defaultOwner: string
}

/** Everything the Sales module holds for a tenant, relative to now. */
export function buildSales(seed: SalesSeed | undefined, ctx: Context): SalesData {
  if (!seed) return emptySales()
  const { id } = ctx
  const now = Date.now()
  const ago = (ms: number) => toIsoInstant(now - ms)
  const clientId = (key: string) => {
    const index = ctx.clientKeys.indexOf(key)
    const row = ctx.clients[index]
    if (!row) throw new Error(`Sales seed: client "${key}" missing`)
    return row.id
  }
  const primaryContact = (cid: string) =>
    ctx.contacts.find((c) => c.clientId === cid && c.isPrimary && !c.deletedAt)

  const sales = emptySales()

  // --- mailboxes
  const mailboxIds = new Map<string, string>()
  for (const m of seed.mailboxes) {
    const mailboxId = id()
    mailboxIds.set(m.key, mailboxId)
    const synced = ago((m.syncedMinutesAgo ?? 4) * 60_000)
    sales.mailboxes.push({
      id: mailboxId,
      provider: m.provider,
      emailAddress: m.address,
      displayName: m.name,
      kind: m.kind,
      ownerUserId: m.owner ? ctx.user(m.owner).id : null,
      status: m.status ?? 'active',
      lastSyncedAt: synced,
      lastError: m.lastError ?? null,
      syncFrom: addDays(ctx.today, -90),
      canSend: m.canSend ?? true,
      imap:
        m.provider === 'imap'
          ? {
              host: 'imap.example.test',
              port: 993,
              security: 'ssl',
              smtpHost: 'smtp.example.test',
              smtpPort: 587,
              smtpSecurity: 'starttls',
              username: m.address,
            }
          : null,
      createdAt: ago(60 * DAY),
      updatedAt: synced,
      deletedAt: null,
    })
  }
  const mailbox = (key: string) => {
    const mid = mailboxIds.get(key)
    const row = sales.mailboxes.find((m) => m.id === mid)
    if (!row) throw new Error(`Sales seed: mailbox "${key}" missing`)
    return row
  }

  // --- stages, rules, settings, exclusions
  const stages: SalesStageRow[] = seed.stages.map((s, index) => ({
    id: id(),
    name: s.name,
    color: s.color,
    position: index + 1,
    kind: s.kind,
    followUpDays: s.followUpDays ?? null,
    staleAfterDays: s.staleAfterDays ?? null,
    isActive: true,
    deletedAt: null,
  }))
  sales.stages = stages
  const stage = (index: number) => {
    const row = stages[index]
    if (!row) throw new Error(`Sales seed: stage ${String(index)} missing`)
    return row
  }
  sales.followUpRules = seed.rules.map((r) => ({
    id: id(),
    name: r.name,
    stageId: r.stage === undefined ? null : stage(r.stage).id,
    daysWithoutReply: r.days,
    createDraft: r.createDraft,
    isActive: r.isActive ?? true,
    deletedAt: null,
  }))
  sales.settings = {
    ...DEFAULT_SETTINGS,
    ...seed.settings,
    digestRecipientIds: (seed.settings.digestRecipients ?? []).map((key) => ctx.user(key).id),
  }
  sales.exclusions = seed.exclusions.map((e) => ({
    id: id(),
    pattern: e.pattern,
    note: e.note ?? null,
    createdAt: ago(e.daysAgo * DAY),
  }))

  // --- deals
  const dealIds = new Map<string, string>()
  for (const d of seed.deals) {
    const dealId = id()
    dealIds.set(d.key, dealId)
    const cid = d.client ? clientId(d.client) : null
    const contact = cid ? primaryContact(cid) : undefined
    const [name, email, phone] = d.contact ?? [
      contact?.name ?? null,
      contact?.email ?? null,
      contact?.phone ?? undefined,
    ]
    const owner = d.owner === undefined ? ctx.defaultOwner : d.owner
    const target = stage(d.stage)
    const job =
      d.converted && cid ? ctx.jobs.find((j) => j.clientId === cid && !j.deletedAt) : undefined
    const createdAt = ago(d.createdDaysAgo * DAY)
    const closedAt =
      target.kind === 'won'
        ? ago((d.wonDaysAgo ?? 1) * DAY)
        : target.kind === 'lost'
          ? ago((d.lost?.daysAgo ?? 1) * DAY)
          : null
    const lastContact = d.lastContactDaysAgo === undefined ? null : ago(d.lastContactDaysAgo * DAY)
    const row: DealRow = {
      id: dealId,
      title: d.title,
      stageId: target.id,
      clientId: cid,
      contactName: name ?? null,
      contactEmail: email?.toLowerCase() ?? null,
      contactPhone: phone ?? null,
      value: d.value ?? null,
      expectedCloseDate:
        d.expectedCloseInDays === undefined ? null : addDays(ctx.today, d.expectedCloseInDays),
      ownerUserId: owner ? ctx.user(owner).id : null,
      source: d.source ?? 'email',
      notes: d.notes ?? null,
      lostReason: target.kind === 'lost' ? (d.lost?.reason ?? 'other') : null,
      lostNote: target.kind === 'lost' ? (d.lost?.note ?? null) : null,
      wonAt: target.kind === 'won' ? closedAt : null,
      lostAt: target.kind === 'lost' ? closedAt : null,
      stageEnteredAt: closedAt ?? lastContact ?? createdAt,
      lastContactAt: lastContact,
      nextFollowUpAt:
        d.followUpInDays === undefined
          ? null
          : zonedDateTimeToInstant(addDays(ctx.today, d.followUpInDays), '09:00', ctx.timeZone),
      jobId: job?.id ?? null,
      extracted: null,
      version: 1,
      createdAt,
      updatedAt: lastContact ?? createdAt,
      deletedAt: null,
    }
    sales.deals.push(row)

    const owned = row.ownerUserId
    const activity = (
      type: DealActivityRow['type'],
      at: string,
      actor: 'user' | 'ai' | 'system',
      text: string | null,
      data: Record<string, unknown> = {},
      userId: string | null = owned,
    ) =>
      sales.activities.push({
        id: id(),
        dealId,
        type,
        actorKind: actor,
        actorUserId: actor === 'user' ? (userId ?? ctx.user(ctx.defaultOwner).id) : null,
        at,
        text,
        data,
      })
    activity('created', createdAt, 'user', null)
    // The way through the funnel: one step per open stage before the current one
    const path = stages.slice(0, d.stage).filter((s) => s.kind === 'open')
    path.forEach((s, i) => {
      const next = stages[i + 1]
      if (!next) return
      const at = toIsoInstant(
        Date.parse(createdAt) + ((now - Date.parse(createdAt)) * (i + 1)) / (path.length + 1),
      )
      activity('stage_changed', at, 'user', null, { fromStageId: s.id, toStageId: next.id })
    })
    if (target.kind !== 'open' && closedAt) {
      const before = stages.filter((s) => s.kind === 'open').at(-1)
      activity('stage_changed', closedAt, 'user', null, {
        fromStageId: before?.id,
        toStageId: target.id,
      })
    }
    if (job && closedAt) {
      activity('converted', closedAt, 'user', null, { jobId: job.id, clientId: cid })
    }
    for (const a of d.activities ?? []) {
      const kind = a.actor === 'ai' || a.actor === 'system' ? a.actor : 'user'
      activity(
        a.type,
        ago(a.daysAgo * DAY),
        kind,
        a.text ?? null,
        {},
        kind === 'user' ? ctx.user(a.actor ?? ctx.defaultOwner).id : null,
      )
    }
  }

  // --- threads and their messages
  const threadIds = new Map<string, string>()
  for (const t of seed.threads) {
    const threadId = id()
    threadIds.set(t.key, threadId)
    const boxes = t.mb.map(mailbox)
    const shown = boxes.find((m) => m.kind === 'shared') ?? boxes[0]
    if (!shown) throw new Error(`Sales seed: thread "${t.key}" has no mailbox`)
    const [name, email] = t.who
    const category = t.cat ?? null
    const aiStatus = t.ai ?? 'done'
    const hasResult = aiStatus === 'done' && category !== null
    const lastAt = Math.max(...t.msgs.map((m) => now - m.ago * HOUR))
    const dealId = t.deal ? (dealIds.get(t.deal) ?? null) : null
    const row: MailThreadRow = {
      id: threadId,
      mailboxIds: boxes.map((m) => m.id),
      shownMailboxId: shown.id,
      subject: t.subject,
      aiStatus,
      category: hasResult || t.byUser ? category : null,
      categorySource: t.byUser ? 'user' : hasResult ? 'ai' : null,
      confidence: t.byUser ? null : hasResult ? (t.conf ?? 0.9) : null,
      isSales: category === null ? null : SALES_CATEGORIES.has(category),
      summary: hasResult ? (t.summary ?? null) : null,
      nextAction: hasResult ? (t.next ?? null) : null,
      suggestedStageId: hasResult && t.stage !== undefined ? stage(t.stage).id : null,
      extracted: hasResult ? { name, email, request: t.summary ?? null } : null,
      aiModel: hasResult ? MOCK_AI_MODEL : null,
      aiProcessedAt: hasResult ? toIsoInstant(lastAt + 60_000) : null,
      aiReadyAt: null,
      dealId,
      clientId: t.client ? clientId(t.client) : null,
      excluded: t.excluded ?? false,
      createdAt: toIsoInstant(Math.min(...t.msgs.map((m) => now - m.ago * HOUR))),
      updatedAt: toIsoInstant(lastAt),
      deletedAt: null,
    }
    if (t.excluded) {
      row.isSales = false
      row.category = null
      row.categorySource = null
    }
    sales.threads.push(row)
    t.msgs.forEach((m, index) => {
      const own = shown
      const holders = (m.mb ?? t.mb).map((key) => mailbox(key))
      const sender =
        m.d === 'in' ? { email, name } : { email: own.emailAddress, name: own.displayName }
      const message: MailMessageRow = {
        id: id(),
        threadId,
        mailboxIds: holders.map((h) => h.id),
        direction: m.d === 'in' ? 'inbound' : 'outbound',
        from: sender,
        to: m.d === 'in' ? [{ email: own.emailAddress, name: own.displayName }] : [{ email, name }],
        // A conversation held by two mailboxes: the second one was in CC
        cc:
          m.d === 'in'
            ? holders
                .filter((h) => h.id !== own.id)
                .map((h) => ({ email: h.emailAddress, name: h.displayName }))
            : [],
        subject: index === 0 ? t.subject : `Re: ${t.subject}`,
        sentAt: toIsoInstant(now - m.ago * HOUR),
        snippet: m.text.replace(/\s+/g, ' ').slice(0, 140),
        bodyText: t.excluded ? null : m.text,
        attachments: (m.files ?? []).map(([fileName, mime, sizeBytes], part) => ({
          partId: `${threadId}-${String(index)}-${String(part)}`,
          fileName,
          mime,
          sizeBytes,
          savedAttachmentId: null,
        })),
      }
      sales.messages.push(message)
    })
  }

  // --- drafts
  for (const d of seed.drafts) {
    const threadId = threadIds.get(d.thread)
    const thread = sales.threads.find((t) => t.id === threadId)
    const source = seed.threads.find((t) => t.key === d.thread)
    if (!thread || !source) throw new Error(`Sales seed: draft of unknown thread "${d.thread}"`)
    const box = mailbox(d.mb)
    const createdAt = ago(d.ago * 60_000)
    const [name, email] = source.who
    const status = d.status
    const row: DraftRow = {
      id: id(),
      threadId: thread.id,
      dealId: thread.dealId,
      mailboxId: box.id,
      kind: d.kind,
      status,
      subject:
        status === 'generating' ? `Re: ${source.subject}` : (d.subject ?? `Re: ${source.subject}`),
      bodyText: status === 'generating' ? '' : d.body,
      to: [{ email, name }],
      cc: [],
      instructions: d.instructions ?? null,
      error: status === 'failed' ? (d.error ?? 'Priprema nacrta nije uspjela.') : null,
      aiModel: status === 'generating' || status === 'failed' ? null : MOCK_AI_MODEL,
      followUpRuleId: d.rule === undefined ? null : (sales.followUpRules[d.rule]?.id ?? null),
      providerDraftId: status === 'saved_to_mailbox' ? `provider-${id()}` : null,
      sentAt: status === 'sent' ? createdAt : null,
      // A draft still "generating" in the seed never finishes: it stays as an example
      readyAt: null,
      createdByUserId: d.by ? ctx.user(d.by).id : null,
      version: status === 'edited' ? 2 : 1,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    }
    sales.drafts.push(row)
  }

  return sales
}
