import type { DispatchBoard, GetDispatchBoardParams, Priority } from '@/shared/api/generated/model'
import { todayInTimeZone } from '@/shared/lib/datetime'

import type { JobRow, TenantData, TechnicianRow } from '../db/rows'
import { OFFICE_ROLES } from '../lib/access'
import { presentJobSummary, technicianBrief } from '../lib/present'
import { ok } from '../lib/problems'
import { route } from '../lib/route'

const PRIORITY_RANK: Record<Priority, number> = { low: 0, normal: 1, high: 2, urgent: 3 }

/** ISO weekday (1 = Monday … 7 = Sunday) of a plain date. */
function isoWeekday(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  const weekday = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)).getUTCDay()
  return weekday === 0 ? 7 : weekday
}

const assigned = (t: TenantData, job: JobRow, technician?: TechnicianRow) =>
  t.assignments.some(
    (a) => a.jobId === job.id && (technician === undefined || a.technicianId === technician.id),
  )

export const dispatchHandlers = [
  route<undefined, GetDispatchBoardParams>(
    'get',
    '/dispatch/board',
    ({ db, auth, query }) => {
      const t = auth.t
      const date = query.date || todayInTimeZone(t.tenant.timezone)
      const live = t.jobs.filter((job) => !job.deletedAt && job.status !== 'cancelled')
      const sequenceOf = (job: JobRow) =>
        t.assignments.find((a) => a.jobId === job.id && a.isLead)?.sequence ??
        Number.MAX_SAFE_INTEGER

      const columns = t.technicians
        .filter((technician) => technician.isActive)
        .map((technician) => {
          // Visit order: position in the day, then start time (no route plans in the mock)
          const jobs = live
            .filter((job) => job.scheduledDate === date && assigned(t, job, technician))
            .sort(
              (a, b) =>
                sequenceOf(a) - sequenceOf(b) ||
                (a.scheduledStart ?? '').localeCompare(b.scheduledStart ?? '') ||
                a.number.localeCompare(b.number),
            )
          return {
            technician: technicianBrief(db, technician),
            workStart: technician.workStart,
            workEnd: technician.workEnd,
            isWorkingDay: technician.workingDays.includes(isoWeekday(date)),
            plannedMinutes: jobs.reduce((sum, job) => sum + job.durationMin, 0),
            jobs: jobs.map((job) => presentJobSummary(db, t, job)),
          }
        })
        .sort((a, b) => a.technician.fullName.localeCompare(b.technician.fullName))

      // "Status new (any date) + scheduled for this date without technicians"
      const unassigned = live
        .filter(
          (job) =>
            job.status === 'new' ||
            (job.status === 'scheduled' && job.scheduledDate === date && !assigned(t, job)),
        )
        .sort(
          (a, b) =>
            PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
            a.createdAt.localeCompare(b.createdAt),
        )

      const board: DispatchBoard = {
        date,
        columns,
        unassigned: unassigned.map((job) => presentJobSummary(db, t, job)),
        publishedPlanId: null,
        draftPlanId: null,
      }
      return ok(board)
    },
    { roles: OFFICE_ROLES },
  ),
]
