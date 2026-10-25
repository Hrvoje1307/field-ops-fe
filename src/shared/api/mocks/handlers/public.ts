import type {
  PublicJob,
  PublicJobStatus,
  RequestPublicRescheduleBody,
} from '@/shared/api/generated/model'
import { toIsoInstant } from '@/shared/lib/datetime'

import { getDb } from '../db'
import type { JobRow, TenantData } from '../db/rows'
import { newId } from '../lib/ids'
import { touch } from '../lib/job-changes'
import { arrivalWindow, firstName } from '../lib/messages'
import { conflict, gone, notFound, ok } from '../lib/problems'
import { broadcast } from '../lib/realtime'
import { eventsBetween, snapshotOf } from '../lib/realtime-events'
import { publicRoute } from '../lib/route'

interface Found {
  t: TenantData
  job: JobRow
}

/** The job a link belongs to: unknown is a 404, an expired link a 410. */
function findByToken(token: string): Found {
  for (const t of Object.values(getDb().tenants)) {
    const job = t.jobs.find((candidate) => candidate.publicToken === token && !candidate.deletedAt)
    if (!job) continue
    if (!job.publicTokenExpiresAt || Date.parse(job.publicTokenExpiresAt) <= Date.now()) {
      throw gone('link.expired', 'This link has expired.')
    }
    return { t, job }
  }
  throw notFound()
}

function publicStatus(job: JobRow): PublicJobStatus {
  switch (job.status) {
    case 'cancelled':
      return 'cancelled'
    case 'completed':
    case 'invoiced':
      return 'done'
    case 'en_route':
    case 'on_site':
      return 'en_route'
    case 'confirmed':
    case 'scheduled':
      return job.rescheduleRequestedAt ? 'reschedule_requested' : job.status
    default:
      return 'scheduled'
  }
}

const hasDate = (job: JobRow) => Boolean(job.scheduledDate)

function present(t: TenantData, job: JobRow): PublicJob {
  const client = t.clients.find((c) => c.id === job.clientId)
  const location = t.locations.find((l) => l.id === job.locationId)
  const contact = t.contacts.find((c) => c.clientId === job.clientId && c.isPrimary && !c.deletedAt)
  const jobType = t.jobTypes.find((type) => type.id === job.jobTypeId)
  const window = arrivalWindow(t, job)
  const open = !job.rescheduleRequestedAt && hasDate(job)
  return {
    company: {
      name: t.tenant.name,
      phone: t.tenant.phone ?? null,
      logoUrl: t.tenant.logoUrl ?? null,
      accentColor: t.tenant.settings.pdfAccentColor ?? null,
    },
    jobNumber: job.number,
    jobTypeName: jobType?.name ?? '',
    clientFirstName: firstName(contact?.name ?? client?.name ?? '') || null,
    addressShort: location?.street ?? '',
    scheduledDate: job.scheduledDate ?? null,
    arrivalWindowStart: window?.from ?? null,
    arrivalWindowEnd: window?.to ?? null,
    status: publicStatus(job),
    canConfirm: job.status === 'scheduled' && open,
    canRequestReschedule: (job.status === 'scheduled' || job.status === 'confirmed') && open,
  }
}

/** The change a client's action made is told to the office, like any other write. */
function announce(t: TenantData, change: () => void): void {
  const before = snapshotOf(t)
  change()
  broadcast(t.tenant.id, eventsBetween(before, snapshotOf(t), toIsoInstant(Date.now())))
}

export const publicHandlers = [
  publicRoute('get', '/public/jobs/{token}', ({ params }) => {
    const { t, job } = findByToken(params.token)
    return ok(present(t, job))
  }),

  publicRoute('post', '/public/jobs/{token}/confirm', ({ params }) => {
    const { t, job } = findByToken(params.token)
    // Idempotent: confirming what is confirmed is what the client sees again
    if (job.status === 'confirmed') return ok(present(t, job))
    if (!present(t, job).canConfirm) {
      throw conflict('public.not_confirmable', 'This job can no longer be confirmed.')
    }
    announce(t, () => {
      job.status = 'confirmed'
      touch(job)
      t.history.push({
        id: newId(),
        jobId: job.id,
        fromStatus: 'scheduled',
        toStatus: 'confirmed',
        changedBy: null,
        actor: 'client',
        changedAt: toIsoInstant(Date.now()),
        lat: null,
        lng: null,
        note: null,
      })
    })
    return ok(present(t, job))
  }),

  publicRoute<RequestPublicRescheduleBody>(
    'post',
    '/public/jobs/{token}/reschedule-request',
    ({ params, body }) => {
      const { t, job } = findByToken(params.token)
      // A request is made once; after it, or when there is nothing scheduled, the link is spent
      if (!present(t, job).canRequestReschedule) {
        throw gone('link.used', 'A new time cannot be requested any more.')
      }
      const dates = (body.preferredDates ?? []).join(', ')
      const note = [body.note?.trim(), dates ? `Željeni datumi: ${dates}.` : null]
        .filter(Boolean)
        .join(' ')
      announce(t, () => {
        job.rescheduleNote = note || null
        job.rescheduleRequestedAt = toIsoInstant(Date.now())
        touch(job)
      })
      return { status: 202, body: present(t, job) }
    },
  ),
]
