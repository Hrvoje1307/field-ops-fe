import type { AssignRequest, JobSummary } from '@/entities/job'
import { canSchedule } from '@/entities/job'
import type { DragMove } from '@/shared/lib/drag-move'

/** The unscheduled queue is a list of the board like the technicians' columns. */
export const QUEUE_ID = 'queue'

/**
 * Cards that can be dragged: a locked job stays where it is (the optimizer keeps it
 * too), a job for several people is changed in the schedule panel (dragging one of
 * several technicians is ambiguous), and one that is under way or done has no schedule.
 */
export function isDraggable(
  job: Pick<JobSummary, 'locked' | 'requiredPeople' | 'technicians' | 'status'>,
): boolean {
  return (
    !job.locked && job.requiredPeople <= 1 && job.technicians.length <= 1 && canSchedule(job.status)
  )
}

/**
 * What a drop asks of the API. Into a column: that technician for the board's day at
 * the dropped position. A start that was agreed for this very day is kept (a confirmed
 * job's time is the client's, not the board's to erase); otherwise there is no start and
 * the position decides the order. Into the queue: no technicians, which takes it off the
 * schedule. Reordering within the queue means nothing (it is sorted by urgency).
 */
export function dropRequest(
  move: DragMove,
  date: string,
  job?: Pick<JobSummary, 'scheduledDate' | 'scheduledStart'>,
): AssignRequest | null {
  if (move.toId === QUEUE_ID) {
    return move.fromId === QUEUE_ID ? null : { technicianIds: [] }
  }
  const keepsStart = Boolean(job?.scheduledStart) && job?.scheduledDate === date
  return {
    technicianIds: [move.toId],
    leadTechnicianId: move.toId,
    scheduledDate: date,
    // Left out, the API keeps the start the job has
    ...(keepsStart ? {} : { scheduledStart: null }),
    sequence: move.index,
  }
}

/**
 * Whether the starts of the jobs that have one run backwards in this order, with the
 * moved job among them: a job that keeps its agreed time and is dropped before an
 * earlier one (or after a later one) is out of order with the times.
 */
export function startsOutOfOrder(
  jobs: readonly Pick<JobSummary, 'id' | 'scheduledStart'>[],
  movedId: string,
): boolean {
  const timed = jobs.filter((job) => job.scheduledStart)
  const at = timed.findIndex((job) => job.id === movedId)
  if (at < 0) return false
  const start = timed[at]?.scheduledStart ?? ''
  return timed.some((job, index) => {
    const other = job.scheduledStart ?? ''
    return (index < at && other > start) || (index > at && other < start)
  })
}

/** The request that locks or unlocks a scheduled job where it is. */
export function lockRequest(
  job: Pick<JobSummary, 'locked' | 'technicians' | 'scheduledDate' | 'scheduledStart'>,
): AssignRequest {
  const lead = job.technicians.find((technician) => technician.isLead) ?? job.technicians[0]
  return {
    technicianIds: job.technicians.map((technician) => technician.id),
    leadTechnicianId: lead?.id ?? null,
    scheduledDate: job.scheduledDate ?? null,
    scheduledStart: job.scheduledStart ?? null,
    locked: !job.locked,
  }
}
