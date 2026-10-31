/**
 * Creating a client (with contacts and a first location) and a job, shared by the
 * Clients and Jobs endpoints and by the conversion of a deal. `build…` validates and
 * collects 400 errors; `insert…` stores what was built.
 */
import type { ClientCreate, JobCreate } from '@/shared/api/generated/model'
import { todayInTimeZone, toIsoInstant } from '@/shared/lib/datetime'

import type { ClientRow, ContactRow, JobRow, LocationRow, TenantData } from '../db/rows'
import { findRow } from './access'
import type { AuthContext } from './auth'
import { validateCustomFields } from './custom-fields'
import { newId } from './ids'
import { applyContacts, applyLocationInput } from './inputs'
import { recordTransition } from './job-changes'
import { FieldErrors, MESSAGES } from './problems'

export function nextJobNumber(t: TenantData): string {
  const year = todayInTimeZone(t.tenant.timezone).slice(0, 4)
  const next = (t.jobSequence[year] ?? 0) + 1
  t.jobSequence[year] = next
  return `${t.tenant.settings.jobNumberPrefix ?? 'RN'}-${year}-${String(next).padStart(4, '0')}`
}

/** Relations and custom fields of a JobCreate/JobUpdate body; collects 400 errors. */
export function validateJobInput(
  t: TenantData,
  body: JobCreate,
  errors: FieldErrors,
  previous?: JobRow,
) {
  const client = findRow(t.clients, body.clientId)
  if (!client) errors.add('clientId', MESSAGES.notFound)
  const location = findRow(t.locations, body.locationId)
  if (!location || (client && location.clientId !== client.id))
    errors.add('locationId', MESSAGES.notFound)
  const jobType = t.jobTypes.find((jt) => jt.id === body.jobTypeId)
  if (!jobType || (!jobType.isActive && previous?.jobTypeId !== jobType.id)) {
    errors.add('jobTypeId', MESSAGES.notFound)
  }
  if (body.assetId) {
    const asset = findRow(t.assets, body.assetId)
    if (!asset || (location && asset.locationId !== location.id))
      errors.add('assetId', MESSAGES.notFound)
  }
  if (body.windowStart && body.windowEnd && body.windowStart >= body.windowEnd) {
    errors.add('windowEnd', 'Kraj mora biti nakon početka.')
  }
  const customFields = validateCustomFields(t, 'job', body.customFields, errors, {
    path: 'customFields',
    previous: previous?.customFields,
  })
  return { jobType, customFields }
}

export interface BuiltClient {
  client: ClientRow
  contacts: ContactRow[]
  location: LocationRow | null
}

export function buildClient(
  t: TenantData,
  body: ClientCreate,
  errors: FieldErrors,
  now: string,
): BuiltClient {
  const clientId = newId()
  const customFields = validateCustomFields(t, 'client', body.customFields, errors, {
    path: 'customFields',
  })
  const { upserts: contacts } = applyContacts(t, clientId, body.contacts, errors)
  const firstLocation = body.firstLocation
    ? applyLocationInput(t, body.firstLocation, errors, { path: 'firstLocation' })
    : null
  const client: ClientRow = {
    id: clientId,
    type: body.type,
    name: body.name.trim(),
    oib: body.oib ?? null,
    email: body.email ?? null,
    notes: body.notes ?? null,
    customFields,
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
  const location: LocationRow | null = firstLocation
    ? {
        id: newId(),
        clientId,
        ...firstLocation,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }
    : null
  return { client, contacts, location }
}

export function insertClient(t: TenantData, built: BuiltClient): void {
  t.clients.push(built.client)
  t.contacts.push(...built.contacts)
  if (built.location) t.locations.push(built.location)
}

export function buildJob(
  t: TenantData,
  auth: AuthContext,
  body: JobCreate,
  errors: FieldErrors,
  now: string,
) {
  const { jobType, customFields } = validateJobInput(t, body, errors)
  if (!jobType || !errors.isEmpty) return null
  const job: JobRow = {
    id: newId(),
    number: nextJobNumber(t),
    status: 'new',
    priority: body.priority ?? 'normal',
    title: body.title.trim(),
    durationMin: body.durationMin ?? jobType.defaultDurationMin,
    requiredPeople: body.requiredPeople ?? jobType.requiredPeople,
    preferredDate: body.preferredDate ?? null,
    windowStart: body.windowStart ?? null,
    windowEnd: body.windowEnd ?? null,
    scheduledDate: null,
    scheduledStart: null,
    locked: false,
    source: body.source ?? 'phone',
    description: body.description ?? null,
    internalNote: body.internalNote ?? null,
    assetId: body.assetId ?? null,
    servicePlanId: null,
    onHoldReason: null,
    cancelReason: null,
    rescheduleNote: null,
    completedAt: null,
    customFields,
    version: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    clientId: body.clientId,
    locationId: body.locationId,
    jobTypeId: body.jobTypeId,
    rescheduleRequestedAt: null,
    publicToken: null,
    publicTokenExpiresAt: null,
    createdBy: auth.user.id,
  }
  return { job, jobType }
}

/** Stores the job, its first history entry and the checklist copied from the job type's template. */
export function insertJob(
  t: TenantData,
  auth: AuthContext,
  job: JobRow,
  jobType: { checklistTemplateId?: string | null },
): void {
  t.jobs.push(job)
  recordTransition(t, job, auth, null, 'new')
  const template = t.checklistTemplates.find((c) => c.id === jobType.checklistTemplateId)
  template?.items.forEach((item, index) => {
    t.checklistItems.push({
      id: newId(),
      jobId: job.id,
      position: index + 1,
      label: item.label,
      isRequired: item.required ?? false,
      isDone: false,
      doneAt: null,
      doneByName: null,
    })
  })
}

export const nowIso = () => toIsoInstant(Date.now())
