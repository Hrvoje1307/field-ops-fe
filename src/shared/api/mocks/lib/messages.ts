import type { Message, MessageChannel, MessageTemplateKey } from '@/shared/api/generated/model'
import { toIsoInstant } from '@/shared/lib/datetime'

import type { ContactRow, JobRow, MessageRow, MockDb, TenantData } from '../db/rows'
import { newId, newToken } from './ids'
import { smsSegments } from './message-templates'

/** How long a message takes to leave and to arrive (none in tests, where it is final at once). */
export const SENT_AFTER_MS = import.meta.env.MODE === 'test' ? 0 : 1500
export const DELIVERED_AFTER_MS = import.meta.env.MODE === 'test' ? 0 : 4000

/** What an SMS costs per message part, in the mock's currency units. */
const SMS_CENTS_PER_SEGMENT = 5

const origin = () => ('location' in globalThis ? globalThis.location.origin : 'http://localhost')

/** The address of the client's page for a job. */
export const publicLink = (token: string) => `${origin()}/p/${token}`

/** The job's link secret, made the first time one is needed and good for the tenant's validity. */
export function ensurePublicToken(t: TenantData, job: JobRow, now = Date.now()): string {
  const valid = job.publicTokenExpiresAt && Date.parse(job.publicTokenExpiresAt) > now
  if (job.publicToken && valid) return job.publicToken
  const hours = t.tenant.settings.publicLinkValidityHours ?? 72
  job.publicToken = newToken('pub')
  job.publicTokenExpiresAt = toIsoInstant(now + hours * 3_600_000)
  return job.publicToken
}

const HHMM = (instant: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(instant))

/** The times the client is told to expect the technician between (a two hour window). */
export function arrivalWindow(t: TenantData, job: JobRow): { from: string; to: string } | null {
  if (!job.scheduledStart) return null
  const timeZone = t.tenant.timezone
  const end = toIsoInstant(Date.parse(job.scheduledStart) + 2 * 3_600_000)
  return { from: HHMM(job.scheduledStart, timeZone), to: HHMM(end, timeZone) }
}

const croatianDate = (date: string) => {
  const [year, month, day] = date.split('-')
  return `${String(Number(day))}. ${String(Number(month))}. ${year ?? ''}.`
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name

/** What a template's placeholders stand for on this job, for this contact. */
export function placeholderValues(
  db: MockDb,
  t: TenantData,
  job: JobRow,
  contact: Pick<ContactRow, 'name'> | undefined,
  token: string,
): Record<string, string> {
  const client = t.clients.find((c) => c.id === job.clientId)
  const lead = t.assignments.find((a) => a.jobId === job.id && a.isLead)
  const technician = lead ? t.technicians.find((x) => x.id === lead.technicianId) : undefined
  const window = arrivalWindow(t, job)
  return {
    klijent: firstName(contact?.name ?? client?.name ?? ''),
    datum: job.scheduledDate ? croatianDate(job.scheduledDate) : '',
    vrijeme_od: window?.from ?? '',
    vrijeme_do: window?.to ?? '',
    firma: t.tenant.name,
    monter: technician
      ? firstName(db.users.find((u) => u.id === technician.userId)?.fullName ?? '')
      : '',
    broj_naloga: job.number,
    link: publicLink(token),
  }
}

/** The message as the API shows it now: queued, then sent, then delivered or failed. */
export function presentMessage(row: MessageRow, now = Date.now()): Message {
  const sent = Date.parse(row.sentAt) <= now
  const arrived = row.deliveredAt !== null && Date.parse(row.deliveredAt) <= now
  const status: Message['status'] = !sent
    ? 'queued'
    : row.outcome === 'delivered'
      ? arrived
        ? 'delivered'
        : 'sent'
      : row.outcome === 'failed'
        ? 'failed'
        : 'undeliverable'
  return {
    id: row.id,
    jobId: row.jobId,
    channel: row.channel,
    templateKey: row.templateKey,
    to: row.to,
    subject: row.subject,
    body: row.body,
    status,
    error: row.error,
    segments: row.segments,
    cost: row.cost,
    sentAt: sent ? row.sentAt : null,
    deliveredAt: arrived ? row.deliveredAt : null,
    createdAt: row.createdAt,
  }
}

/** A message that will be delivered, made now. */
export function newMessage(
  t: TenantData,
  fields: {
    jobId: string
    channel: MessageChannel
    templateKey: MessageTemplateKey | null
    to: string
    subject: string | null
    body: string
  },
  now = Date.now(),
): MessageRow {
  const segments = fields.channel === 'sms' ? smsSegments(fields.body).segments : null
  const cents = segments === null ? null : segments * SMS_CENTS_PER_SEGMENT
  const row: MessageRow = {
    id: newId(),
    jobId: fields.jobId,
    channel: fields.channel,
    templateKey: fields.templateKey,
    to: fields.to,
    subject: fields.subject,
    body: fields.body,
    error: null,
    segments,
    cost: cents === null ? null : (cents / 100).toFixed(2),
    createdAt: toIsoInstant(now),
    outcome: 'delivered',
    sentAt: toIsoInstant(now + SENT_AFTER_MS),
    deliveredAt: toIsoInstant(now + DELIVERED_AFTER_MS),
  }
  t.messages.push(row)
  // The month's use of messages, which the owner sees in the settings
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
  if (fields.channel === 'sms') {
    usage.smsCount += 1
    usage.smsCost = ((Math.round(Number(usage.smsCost) * 100) + (cents ?? 0)) / 100).toFixed(2)
  } else {
    usage.emailCount += 1
  }
  return row
}
