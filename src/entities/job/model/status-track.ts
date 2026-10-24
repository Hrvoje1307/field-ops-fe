import type { JobStatus, StatusHistoryEntry } from '@/shared/api/generated/model'

/**
 * The usual path of a job, in display order. Display only: which changes a user may
 * make comes from `Job.allowedTransitions`.
 */
export const TRACK_STATUSES = [
  'new',
  'scheduled',
  'confirmed',
  'en_route',
  'on_site',
  'completed',
  'invoiced',
] as const satisfies readonly JobStatus[]

export type TrackStatus = (typeof TRACK_STATUSES)[number]
export type OffTrackStatus = Exclude<JobStatus, TrackStatus>

/**
 * - `done`: reached (since the job last went back to `new`)
 * - `skipped`: passed over, e.g. `scheduled → en_route` without `confirmed`
 * - `current`: the job's status
 * - `upcoming`: not reached yet
 */
export type TrackStepState = 'done' | 'skipped' | 'current' | 'upcoming'

export interface TrackStep {
  status: TrackStatus
  state: TrackStepState
  /** When the job last entered this status (instant), if known. */
  at: string | null
}

export interface StatusTrackModel {
  steps: TrackStep[]
  /** Set while the job is off the usual path (on hold, cancelled). */
  offTrack: { status: OffTrackStatus; at: string | null } | null
}

function isTrackStatus(status: JobStatus): status is TrackStatus {
  return (TRACK_STATUSES as readonly JobStatus[]).includes(status)
}

/**
 * Steps of the status track for a job.
 *
 * Only history since the job last entered `new` counts (creation, back to the queue,
 * reopening). Off the path (on hold, cancelled), the track stops at the last step the
 * job reached. Without history (still loading), steps before the current one count as
 * done.
 */
export function trackSteps(status: JobStatus, history?: StatusHistoryEntry[]): StatusTrackModel {
  const entries = [...(history ?? [])].sort((a, b) => a.changedAt.localeCompare(b.changedAt))
  const lastNew = entries.map((entry) => entry.toStatus).lastIndexOf('new')
  const run = lastNew >= 0 ? entries.slice(lastNew) : entries

  const reachedAt = new Map<JobStatus, string>()
  for (const entry of run) reachedAt.set(entry.toStatus, entry.changedAt)

  let position: number
  if (isTrackStatus(status)) {
    position = TRACK_STATUSES.indexOf(status)
  } else {
    const lastOnTrack = run.findLast((entry) => isTrackStatus(entry.toStatus))?.toStatus
    position = lastOnTrack && isTrackStatus(lastOnTrack) ? TRACK_STATUSES.indexOf(lastOnTrack) : 0
  }

  const steps = TRACK_STATUSES.map((step, index): TrackStep => {
    const at = reachedAt.get(step) ?? null
    if (index > position) return { status: step, state: 'upcoming', at: null }
    if (index === position && step === status) return { status: step, state: 'current', at }
    const passed = history === undefined || at !== null
    return { status: step, state: passed ? 'done' : 'skipped', at }
  })

  return {
    steps,
    offTrack: isTrackStatus(status) ? null : { status, at: reachedAt.get(status) ?? null },
  }
}
