import { addDays, toIsoInstant, zonedDateTimeToInstant } from '@/shared/lib/datetime'

import type { ContactRow, JobRow, MessageRow } from '../db/rows'
import { smsSegments } from '../lib/message-templates'

/**
 * Messages the tenant has already sent, in the past: reminders that arrived, one that
 * did not, one the operator refused, and a report e-mail. They give the lists and the
 * job pages something to show; nothing here is sent again.
 */
export function seedMessages({
  jobs,
  contacts,
  company,
  timeZone,
  id,
}: {
  jobs: JobRow[]
  contacts: ContactRow[]
  company: string
  timeZone: string
  id: () => string
}): MessageRow[] {
  const primary = (job: JobRow) =>
    contacts.find((c) => c.clientId === job.clientId && c.isPrimary && !c.deletedAt)
  const sms = (
    job: JobRow,
    createdAt: string,
    outcome: MessageRow['outcome'],
    error: string | null,
  ): MessageRow | null => {
    const contact = primary(job)
    if (!contact?.phone) return null
    const body = `${company}: podsjetnik, sutra vam dolazi monter. Nalog ${job.number}.`
    const segments = smsSegments(body).segments
    const created = Date.parse(createdAt)
    return {
      id: id(),
      jobId: job.id,
      channel: 'sms',
      templateKey: 'reminder_day_before',
      to: contact.phone,
      subject: null,
      body,
      error,
      segments,
      cost: ((segments * 5) / 100).toFixed(2),
      createdAt,
      outcome,
      sentAt: toIsoInstant(created + 2000),
      deliveredAt: outcome === 'delivered' ? toIsoInstant(created + 8000) : null,
    }
  }

  const evening = (job: JobRow) =>
    zonedDateTimeToInstant(addDays(job.scheduledDate ?? '', -1), '17:00', timeZone)
  const planned = jobs.filter(
    (job) =>
      !job.deletedAt &&
      job.scheduledDate &&
      (job.status === 'scheduled' || job.status === 'confirmed') &&
      primary(job)?.phone,
  )
  const messages: (MessageRow | null)[] = [
    ...planned.slice(0, 3).map((job) => sms(job, evening(job), 'delivered', null)),
    planned[3] ? sms(planned[3], evening(planned[3]), 'failed', 'Broj nije dostupan.') : null,
    planned[4]
      ? sms(planned[4], evening(planned[4]), 'undeliverable', 'Operator je odbio poruku.')
      : null,
  ]

  const done = jobs.find(
    (job) => !job.deletedAt && job.status === 'completed' && job.completedAt && primary(job),
  )
  const email = primary(done ?? ({} as JobRow))?.email
  if (done?.completedAt && email) {
    const created = Date.parse(done.completedAt) + 60_000
    messages.push({
      id: id(),
      jobId: done.id,
      channel: 'email',
      templateKey: 'report_ready',
      to: email,
      subject: `Izvještaj za nalog ${done.number}`,
      body: `Poštovani, izvještaj o obavljenom radu je spreman.\n\n${company}`,
      error: null,
      segments: null,
      cost: null,
      createdAt: toIsoInstant(created),
      outcome: 'delivered',
      sentAt: toIsoInstant(created + 2000),
      deliveredAt: toIsoInstant(created + 8000),
    })
  }
  return messages.filter((message): message is MessageRow => message !== null)
}
