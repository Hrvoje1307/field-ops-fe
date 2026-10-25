import type { JobStatus } from '@/shared/api/generated/model'
import { toIsoInstant } from '@/shared/lib/datetime'

import type { JobRow, TenantData } from '../db/rows'
import type { AuthContext } from './auth'
import { newId } from './ids'

export function recordTransition(
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

export function touch(job: JobRow): void {
  job.version += 1
  job.updatedAt = toIsoInstant(Date.now())
}
