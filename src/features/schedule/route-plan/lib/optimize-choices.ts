import type { DispatchBoard } from '@/entities/dispatch'
import type { JobSummary } from '@/entities/job'

/** Statuses of scheduled jobs the optimizer may rearrange (not under way, done or on hold). */
const REARRANGEABLE: readonly JobSummary['status'][] = ['scheduled', 'confirmed']

export interface OptimizeChoices {
  /** Waiting for a technician. */
  queued: JobSummary[]
  /** Already on a technician's day. */
  scheduled: JobSummary[]
  /** Technicians who work that day; the others cannot take part. */
  working: DispatchBoard['columns']
  dayOff: DispatchBoard['columns']
}

/** What the day offers the optimizer. Locked and crew jobs are offered too: they stay with their people. */
export function optimizeChoices(board: DispatchBoard): OptimizeChoices {
  return {
    queued: board.unassigned.filter((job) => job.status === 'new' || job.status === 'scheduled'),
    // A job for several technicians is on each of their columns: once is enough
    scheduled: [
      ...new Map(
        board.columns
          .flatMap((column) => column.jobs)
          .filter((job) => REARRANGEABLE.includes(job.status))
          .map((job) => [job.id, job]),
      ).values(),
    ],
    working: board.columns.filter((column) => column.isWorkingDay),
    dayOff: board.columns.filter((column) => !column.isWorkingDay),
  }
}
