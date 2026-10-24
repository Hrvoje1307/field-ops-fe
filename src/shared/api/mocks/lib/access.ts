import type { JobStatus, Role } from '@/shared/api/generated/model'

import type { JobRow, TenantData } from '../db/rows'
import type { AuthContext } from './auth'
import { notFound } from './problems'

export const ALL_ROLES = ['owner', 'dispatcher', 'technician'] as const satisfies readonly Role[]
export const OFFICE_ROLES = ['owner', 'dispatcher'] as const satisfies readonly Role[]
export const OWNER_ONLY = ['owner'] as const satisfies readonly Role[]

/** Who is looking: decides job visibility, sensitive values and allowed transitions. */
export interface Viewer {
  userId: string
  role: Role
  technicianId: string | null
}

export const viewerOf = (auth: AuthContext): Viewer => ({
  userId: auth.user.id,
  role: auth.role,
  technicianId: auth.technicianId,
})

const CLOSED_STATUSES: readonly JobStatus[] = ['completed', 'invoiced', 'cancelled']
export const isOpenStatus = (status: JobStatus) => !CLOSED_STATUSES.includes(status)

export const isOffice = (viewer: Viewer) => viewer.role !== 'technician'

/** Row by id within the tenant, ignoring soft-deleted rows. */
export function findRow<T extends { id: string; deletedAt?: string | null }>(
  rows: T[],
  id: string,
): T | undefined {
  return rows.find((row) => row.id === id && !row.deletedAt)
}

/** Same, but a missing (or other tenant's) id is a 404. */
export function getRow<T extends { id: string; deletedAt?: string | null }>(
  rows: T[],
  id: string,
): T {
  const row = findRow(rows, id)
  if (!row) throw notFound()
  return row
}

export function isAssigned(t: TenantData, jobId: string, technicianId: string | null): boolean {
  return (
    technicianId !== null &&
    t.assignments.some((a) => a.jobId === jobId && a.technicianId === technicianId)
  )
}

/** A job the viewer may see: technicians only ever see jobs assigned to them (others are 404). */
export function getVisibleJob(t: TenantData, viewer: Viewer, jobId: string): JobRow {
  const job = getRow(t.jobs, jobId)
  if (!isOffice(viewer) && !isAssigned(t, job.id, viewer.technicianId)) throw notFound()
  return job
}

function hasOpenAssignedJob(
  t: TenantData,
  viewer: Viewer,
  matches: (job: JobRow) => boolean,
): boolean {
  return t.jobs.some(
    (job) =>
      !job.deletedAt &&
      isOpenStatus(job.status) &&
      matches(job) &&
      isAssigned(t, job.id, viewer.technicianId),
  )
}

/** Access codes and sensitive location/asset fields: office, or assigned to an open job at that location. */
export function canSeeLocationSecrets(t: TenantData, viewer: Viewer, locationId: string): boolean {
  return isOffice(viewer) || hasOpenAssignedJob(t, viewer, (job) => job.locationId === locationId)
}

/** Sensitive client fields: office, or assigned to an open job for that client. */
export function canSeeClientSecrets(t: TenantData, viewer: Viewer, clientId: string): boolean {
  return isOffice(viewer) || hasOpenAssignedJob(t, viewer, (job) => job.clientId === clientId)
}

/** Sensitive job fields: office, or assigned to that job. */
export function canSeeJobSecrets(t: TenantData, viewer: Viewer, job: JobRow): boolean {
  return isOffice(viewer) || isAssigned(t, job.id, viewer.technicianId)
}
