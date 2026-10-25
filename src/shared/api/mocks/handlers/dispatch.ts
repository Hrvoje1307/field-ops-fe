import type {
  DispatchBoard,
  GetDispatchBoardParams,
  Priority,
  RoutePlanStatus,
} from '@/shared/api/generated/model'
import { todayInTimeZone } from '@/shared/lib/datetime'

import type { JobRow, TenantData, TechnicianRow } from '../db/rows'
import { OFFICE_ROLES } from '../lib/access'
import { presentJobSummary, technicianBrief } from '../lib/present'
import { ok } from '../lib/problems'
import { route } from '../lib/route'
import { isoWeekday, visitOrder } from '../lib/visit-order'

const PRIORITY_RANK: Record<Priority, number> = { low: 0, normal: 1, high: 2, urgent: 3 }

const assigned = (t: TenantData, job: JobRow, technician?: TechnicianRow) =>
  t.assignments.some(
    (a) => a.jobId === job.id && (technician === undefined || a.technicianId === technician.id),
  )

/** The newest plan of a day with that status. */
function latestPlan(t: TenantData, date: string, status: RoutePlanStatus): string | null {
  const plans = t.routePlans.filter((plan) => plan.date === date && plan.status === status)
  plans.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return plans[0]?.id ?? null
}

export const dispatchHandlers = [
  route<undefined, GetDispatchBoardParams>(
    'get',
    '/dispatch/board',
    ({ db, auth, query }) => {
      const t = auth.t
      const date = query.date || todayInTimeZone(t.tenant.timezone)
      const live = t.jobs.filter((job) => !job.deletedAt && job.status !== 'cancelled')
      const columns = t.technicians
        .filter((technician) => technician.isActive)
        .map((technician) => {
          // Visit order: position in the day, then start time (no route plans in the mock)
          const jobs = visitOrder(t, technician.id, date)
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
        publishedPlanId: latestPlan(t, date, 'published'),
        draftPlanId: latestPlan(t, date, 'draft'),
      }
      return ok(board)
    },
    { roles: OFFICE_ROLES },
  ),
]
