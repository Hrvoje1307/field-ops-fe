import type { JobStatus } from '@/shared/api/generated/model'

import type { JobRow, TenantData } from '../db/rows'
import { isAssigned, isOffice, type Viewer } from './access'

/** Exactly the table in the OpenAPI description (`completed` is reached only via /complete). */
export const TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  new: ['scheduled', 'cancelled'],
  scheduled: ['confirmed', 'en_route', 'new', 'cancelled'],
  confirmed: ['en_route', 'scheduled', 'cancelled'],
  en_route: ['on_site', 'scheduled'],
  on_site: ['completed', 'on_hold'],
  on_hold: ['new', 'scheduled', 'cancelled'],
  completed: ['invoiced', 'new'],
  invoiced: [],
  cancelled: ['new'],
}

/** What an assigned technician may do in the field; everything else is office-only. */
export const TECHNICIAN_TRANSITIONS: Partial<Record<JobStatus, readonly JobStatus[]>> = {
  scheduled: ['en_route'],
  confirmed: ['en_route'],
  en_route: ['on_site'],
  on_site: ['on_hold', 'completed'],
}

export const NOTE_REQUIRED: readonly JobStatus[] = ['cancelled', 'on_hold']

/** `scheduled` needs a date and at least one technician. */
export function isSchedulable(t: TenantData, job: JobRow): boolean {
  return (
    job.scheduledDate !== null &&
    job.scheduledDate !== undefined &&
    t.assignments.some((a) => a.jobId === job.id)
  )
}

export function canPerform(t: TenantData, viewer: Viewer, job: JobRow, to: JobStatus): boolean {
  if (isOffice(viewer)) return true
  return (
    isAssigned(t, job.id, viewer.technicianId) &&
    (TECHNICIAN_TRANSITIONS[job.status] ?? []).includes(to)
  )
}

/**
 * Transitions the viewer may perform now. Includes `completed` for an on_site job
 * (the UI shows the button, which goes through /complete).
 */
export function allowedTransitions(t: TenantData, viewer: Viewer, job: JobRow): JobStatus[] {
  return TRANSITIONS[job.status].filter(
    (to) => canPerform(t, viewer, job, to) && (to !== 'scheduled' || isSchedulable(t, job)),
  )
}
