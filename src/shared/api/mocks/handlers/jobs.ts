import type {
  AssignRequest,
  JobCreate,
  JobStatus,
  JobUpdate,
  ListJobsParams,
  Priority,
  TransitionRequest,
} from '@/shared/api/generated/model'
import { dateInTimeZone, todayInTimeZone, toIsoInstant } from '@/shared/lib/datetime'

import type { JobRow, TenantData } from '../db/rows'
import type { AuthContext } from '../lib/auth'
import {
  ALL_ROLES,
  canSeeJobSecrets,
  findRow,
  getVisibleJob,
  isAssigned,
  OFFICE_ROLES,
  viewerOf,
  type Viewer,
} from '../lib/access'
import { validateCustomFields } from '../lib/custom-fields'
import { newId } from '../lib/ids'
import { canPerform, isSchedulable, NOTE_REQUIRED, TRANSITIONS } from '../lib/job-machine'
import { formatAddress, presentHistory, presentJob, presentJobSummary } from '../lib/present'
import {
  conflict,
  created,
  FieldErrors,
  forbidden,
  invalidField,
  MESSAGES,
  notFound,
  ok,
} from '../lib/problems'
import { route } from '../lib/route'
import { matchesQuery } from '../lib/text'

const PRIORITY_RANK: Record<Priority, number> = { low: 0, normal: 1, high: 2, urgent: 3 }

/** Statuses from which /assign may change technicians and the date. */
const ASSIGNABLE: readonly JobStatus[] = ['new', 'scheduled', 'confirmed', 'on_hold']

function nextJobNumber(t: TenantData): string {
  const year = todayInTimeZone(t.tenant.timezone).slice(0, 4)
  const next = (t.jobSequence[year] ?? 0) + 1
  t.jobSequence[year] = next
  return `${t.tenant.settings.jobNumberPrefix ?? 'RN'}-${year}-${String(next).padStart(4, '0')}`
}

function recordTransition(
  t: TenantData,
  job: JobRow,
  auth: AuthContext,
  from: JobStatus | null,
  to: JobStatus,
  extra: { note?: string | null; lat?: number | null; lng?: number | null } = {},
): void {
  t.history.push({
    id: newId(),
    jobId: job.id,
    fromStatus: from,
    toStatus: to,
    changedBy: { id: auth.user.id, fullName: auth.user.fullName },
    actor: 'user',
    changedAt: toIsoInstant(Date.now()),
    lat: extra.lat ?? null,
    lng: extra.lng ?? null,
    note: extra.note ?? null,
  })
}

function touch(job: JobRow): void {
  job.version += 1
  job.updatedAt = toIsoInstant(Date.now())
}

function checkVersion(job: JobRow, version: number | undefined): void {
  if (version !== undefined && version !== job.version) {
    throw conflict('job.version_conflict', 'The job was changed by someone else.')
  }
}

/** Relations and custom fields of a JobCreate/JobUpdate body; collects 400 errors. */
function validateJobInput(
  t: TenantData,
  body: JobCreate,
  errors: FieldErrors,
  viewer: Viewer,
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
    canSeeSensitive: previous ? canSeeJobSecrets(t, viewer, previous) : true,
  })
  return { jobType, customFields }
}

/** Office fields of a full-replacement PUT (omitted nullable fields are cleared). */
function officeFields(body: JobUpdate, current: JobRow) {
  return {
    clientId: body.clientId,
    locationId: body.locationId,
    assetId: body.assetId ?? null,
    jobTypeId: body.jobTypeId,
    priority: body.priority ?? current.priority,
    source: body.source ?? current.source,
    title: body.title.trim(),
    description: body.description ?? null,
    durationMin: body.durationMin ?? current.durationMin,
    requiredPeople: body.requiredPeople ?? current.requiredPeople,
    preferredDate: body.preferredDate ?? null,
    windowStart: body.windowStart ?? null,
    windowEnd: body.windowEnd ?? null,
    locked: body.locked ?? current.locked,
    customFields: body.customFields ?? {},
  }
}

const sameValue = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

const SORTS: Record<string, (a: JobRow, b: JobRow) => number> = {
  createdAt: (a, b) => a.createdAt.localeCompare(b.createdAt),
  number: (a, b) => a.number.localeCompare(b.number),
  priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  scheduledStart: (a, b) => (a.scheduledStart ?? '').localeCompare(b.scheduledStart ?? ''),
}

export const jobHandlers = [
  route<undefined, ListJobsParams>(
    'get',
    '/jobs',
    ({ db, auth, query }) => {
      const t = auth.t
      if (query.unscheduled && (query.from || query.to)) {
        invalidField('unscheduled', 'Ne može se kombinirati s from/to.')
      }
      let rows = t.jobs.filter((j) => !j.deletedAt)
      // Technicians only ever see their own jobs, whatever the filters say
      if (auth.role === 'technician')
        rows = rows.filter((j) => isAssigned(t, j.id, auth.technicianId))

      rows = rows.filter((j) => {
        const location = t.locations.find((l) => l.id === j.locationId)
        const client = t.clients.find((c) => c.id === j.clientId)
        return (
          (!query.status?.length || query.status.includes(j.status)) &&
          (!query.from || (j.scheduledDate ?? '') >= query.from) &&
          (!query.to || (!!j.scheduledDate && j.scheduledDate <= query.to)) &&
          (query.unscheduled === undefined || (j.scheduledDate === null) === query.unscheduled) &&
          (!query.technicianId || isAssigned(t, j.id, query.technicianId)) &&
          (!query.jobTypeId || j.jobTypeId === query.jobTypeId) &&
          (!query.clientId || j.clientId === query.clientId) &&
          (!query.locationId || j.locationId === query.locationId) &&
          (!query.assetId || j.assetId === query.assetId) &&
          (!query.priority || j.priority === query.priority) &&
          matchesQuery(query.q, [
            j.number,
            j.title,
            client?.name,
            location ? formatAddress(location) : null,
          ])
        )
      })

      const sort = query.sort ?? '-createdAt'
      const key = sort.replace(/^-/, '')
      const direction = sort.startsWith('-') ? -1 : 1
      const compare = SORTS[key] ?? SORTS.createdAt
      rows.sort((a, b) => {
        // Unscheduled jobs go last whatever the direction
        if (key === 'scheduledStart' && !a.scheduledStart !== !b.scheduledStart)
          return a.scheduledStart ? -1 : 1
        return direction * (compare?.(a, b) ?? 0) || a.number.localeCompare(b.number)
      })

      const page = query.page ?? 1
      const pageSize = query.pageSize ?? 50
      return ok({
        page,
        pageSize,
        totalCount: rows.length,
        items: rows
          .slice((page - 1) * pageSize, page * pageSize)
          .map((j) => presentJobSummary(db, t, j)),
      })
    },
    { roles: ALL_ROLES },
  ),

  route<JobCreate>(
    'post',
    '/jobs',
    ({ db, auth, body }) => {
      const t = auth.t
      const errors = new FieldErrors()
      const { jobType, customFields } = validateJobInput(t, body, errors, viewerOf(auth))
      errors.throwIfAny()
      if (!jobType) throw notFound()

      const now = toIsoInstant(Date.now())
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
        createdBy: auth.user.id,
      }
      t.jobs.push(job)
      recordTransition(t, job, auth, null, 'new')

      // The checklist is copied from the job type's template
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
      return created(presentJob(db, t, job, viewerOf(auth)))
    },
    { roles: OFFICE_ROLES },
  ),

  route(
    'get',
    '/jobs/{id}',
    ({ db, auth, params }) => {
      const viewer = viewerOf(auth)
      return ok(presentJob(db, auth.t, getVisibleJob(auth.t, viewer, params.id), viewer))
    },
    { roles: ALL_ROLES },
  ),

  route<JobUpdate>(
    'put',
    '/jobs/{id}',
    ({ db, auth, body, params }) => {
      const t = auth.t
      const viewer = viewerOf(auth)
      const job = getVisibleJob(t, viewer, params.id)
      checkVersion(job, body.version)
      const next = officeFields(body, job)

      if (auth.role === 'technician') {
        const changed = (Object.keys(next) as (keyof typeof next)[]).filter(
          (key) => !sameValue(next[key], job[key]),
        )
        if (changed.length > 0) {
          throw forbidden(
            'job.field_not_editable',
            `Technicians may only change internalNote (changed: ${changed.join(', ')}).`,
          )
        }
        job.internalNote = body.internalNote ?? null
      } else {
        if (job.status === 'invoiced')
          throw conflict('job.not_editable', 'Invoiced jobs can no longer be edited.')
        const errors = new FieldErrors()
        const { customFields } = validateJobInput(t, body, errors, viewer, job)
        errors.throwIfAny()
        Object.assign(job, next, { customFields, internalNote: body.internalNote ?? null })
      }
      touch(job)
      return ok(presentJob(db, t, job, viewer))
    },
    { roles: ALL_ROLES },
  ),

  route<TransitionRequest>(
    'post',
    '/jobs/{id}/transition',
    ({ db, auth, body, params }) => {
      const t = auth.t
      const viewer = viewerOf(auth)
      const job = getVisibleJob(t, viewer, params.id)
      checkVersion(job, body.version)
      const from = job.status
      const to = body.to

      if (to === 'completed') {
        throw conflict(
          'job.use_complete_endpoint',
          'Jobs are completed via POST /jobs/{id}/complete.',
        )
      }
      if (!TRANSITIONS[from].includes(to)) {
        throw conflict('job.invalid_transition', `Transition ${from} → ${to} is not allowed.`)
      }
      if (!canPerform(t, viewer, job, to)) throw forbidden('job.transition_forbidden')
      if (to === 'scheduled' && !isSchedulable(t, job)) {
        throw conflict(
          'job.not_schedulable',
          'A scheduled job needs a date and at least one technician.',
        )
      }
      const note = body.note?.trim() ?? null
      if (NOTE_REQUIRED.includes(to) && !note) invalidField('note', MESSAGES.required)

      job.status = to
      if (to === 'on_hold') job.onHoldReason = note
      if (to === 'cancelled') job.cancelReason = note
      if (from === 'on_hold') job.onHoldReason = null
      if (from === 'cancelled') job.cancelReason = null
      if (to === 'new') {
        // Back to the queue (unschedule, reopen): no date, no technicians
        job.scheduledDate = null
        job.scheduledStart = null
        job.completedAt = null
        t.assignments = t.assignments.filter((a) => a.jobId !== job.id)
      }
      touch(job)
      recordTransition(t, job, auth, from, to, { note, lat: body.lat, lng: body.lng })
      return ok(presentJob(db, t, job, viewer))
    },
    { roles: ALL_ROLES },
  ),

  route<AssignRequest>(
    'post',
    '/jobs/{id}/assign',
    ({ db, auth, body, params }) => {
      const t = auth.t
      const viewer = viewerOf(auth)
      const job = getVisibleJob(t, viewer, params.id)
      checkVersion(job, body.version)
      if (!ASSIGNABLE.includes(job.status)) {
        throw conflict('job.not_assignable', `A job in status ${job.status} can't be reassigned.`)
      }

      const errors = new FieldErrors()
      body.technicianIds.forEach((id, index) => {
        if (!t.technicians.some((tech) => tech.id === id && tech.isActive)) {
          errors.add(`technicianIds[${String(index)}]`, MESSAGES.notFound)
        }
      })
      const leadId = body.leadTechnicianId ?? body.technicianIds[0] ?? null
      if (leadId && !body.technicianIds.includes(leadId))
        errors.add('leadTechnicianId', MESSAGES.notAllowed)
      const scheduledDate =
        body.scheduledDate === undefined ? (job.scheduledDate ?? null) : body.scheduledDate
      const scheduledStart =
        body.scheduledStart === undefined ? (job.scheduledStart ?? null) : body.scheduledStart
      if (body.scheduledStart && !scheduledDate) errors.add('scheduledDate', MESSAGES.required)
      if (
        body.scheduledStart &&
        scheduledDate &&
        dateInTimeZone(body.scheduledStart, t.tenant.timezone) !== scheduledDate
      ) {
        errors.add('scheduledStart', 'Početak mora biti na dan termina.')
      }
      errors.throwIfAny()

      const assignedAt = toIsoInstant(Date.now())
      t.assignments = [
        ...t.assignments.filter((a) => a.jobId !== job.id),
        ...body.technicianIds.map((technicianId) => ({
          jobId: job.id,
          technicianId,
          isLead: technicianId === leadId,
          sequence: technicianId === leadId ? (body.sequence ?? null) : null,
          assignedAt,
        })),
      ]
      job.scheduledDate = scheduledDate
      job.scheduledStart = scheduledDate ? scheduledStart : null
      if (body.locked !== undefined) job.locked = body.locked

      const from = job.status
      const hasPlan = Boolean(job.scheduledDate) && body.technicianIds.length > 0
      let to: JobStatus = from
      if (hasPlan && (from === 'new' || from === 'on_hold')) to = 'scheduled'
      if (!hasPlan && (from === 'scheduled' || from === 'confirmed')) to = 'new'
      if (to === 'new' && from !== 'new') {
        job.scheduledDate = null
        job.scheduledStart = null
      }
      if (to !== from) {
        job.status = to
        if (from === 'on_hold') job.onHoldReason = null
        recordTransition(t, job, auth, from, to)
      }
      touch(job)
      return ok(presentJob(db, t, job, viewer))
    },
    { roles: OFFICE_ROLES },
  ),

  route(
    'get',
    '/jobs/{id}/history',
    ({ auth, params }) => {
      const job = getVisibleJob(auth.t, viewerOf(auth), params.id)
      return ok(
        auth.t.history
          .filter((h) => h.jobId === job.id)
          .sort((a, b) => a.changedAt.localeCompare(b.changedAt))
          .map(presentHistory),
      )
    },
    { roles: ALL_ROLES },
  ),
]
