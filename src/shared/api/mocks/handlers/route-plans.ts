import type {
  JobStatus,
  OptimizeRoutesBody,
  RoutePlan,
  UpdateRoutePlanBody,
} from '@/shared/api/generated/model'
import { todayInTimeZone, toIsoInstant } from '@/shared/lib/datetime'

import type { JobRow, TechnicianRow, TenantData } from '../db/rows'
import { getRow, OFFICE_ROLES } from '../lib/access'
import { newId } from '../lib/ids'
import { recordTransition, touch } from '../lib/job-changes'
import { featuresOf } from '../lib/present'
import { conflict, created, FieldErrors, MESSAGES, ok, paymentRequired } from '../lib/problems'
import { route } from '../lib/route'
import {
  type Point,
  type SolverContext,
  type SolverJob,
  type SolverTechnician,
  solve,
  timeRoute,
  toRoutes,
} from '../lib/route-solver'
import { isoWeekday } from '../lib/visit-order'

const PRIORITY_RANK = { low: 0, normal: 1, high: 2, urgent: 3 } as const

/** The statuses a plan may schedule (the same as /assign). */
const PLANNABLE: readonly JobStatus[] = ['new', 'scheduled', 'confirmed', 'on_hold']

function contextOf(t: TenantData, date: string): SolverContext {
  return {
    date,
    timeZone: t.tenant.timezone,
    depotId: t.depots[0]?.id ?? null,
    skillNames: new Map(t.skills.map((skill) => [skill.id, skill.name])),
    newRouteId: newId,
  }
}

function solverTechnician(t: TenantData, row: TechnicianRow, date: string): SolverTechnician {
  const depot = t.depots[0]
  const base: Point | null =
    depot?.lat !== undefined && depot.lat !== null && depot.lng !== undefined && depot.lng !== null
      ? { lat: depot.lat, lng: depot.lng }
      : null
  return {
    id: row.id,
    workStart: row.workStart,
    workEnd: row.workEnd,
    worksThatDay: row.workingDays.includes(isoWeekday(date)),
    skillIds: row.skillIds,
    base,
  }
}

function solverJob(t: TenantData, job: JobRow, date: string): SolverJob {
  const location = t.locations.find((l) => l.id === job.locationId)
  const type = t.jobTypes.find((jt) => jt.id === job.jobTypeId)
  const assignees = t.assignments.filter((a) => a.jobId === job.id).map((a) => a.technicianId)
  const fixed = job.locked || job.requiredPeople > 1
  return {
    id: job.id,
    number: job.number,
    durationMin: job.durationMin,
    priorityRank: PRIORITY_RANK[job.priority],
    point:
      location?.lat !== undefined &&
      location.lat !== null &&
      location.lng !== undefined &&
      location.lng !== null
        ? { lat: location.lat, lng: location.lng }
        : null,
    requiredSkillIds: type?.requiredSkillIds ?? [],
    windowStart: job.windowStart ?? null,
    windowEnd: job.windowEnd ?? null,
    fixedTechnicianIds: fixed ? assignees : null,
    fixedStart: fixed && job.scheduledDate === date ? (job.scheduledStart ?? null) : null,
  }
}

function withTotals(plan: Omit<RoutePlan, 'totalDistanceM' | 'totalDurationS'>): RoutePlan {
  return {
    ...plan,
    totalDistanceM: plan.routes.reduce((sum, r) => sum + (r.distanceM ?? 0), 0),
    totalDurationS: plan.routes.reduce((sum, r) => sum + (r.durationS ?? 0), 0),
  }
}

function countOptimization(t: TenantData): void {
  const month = todayInTimeZone(t.tenant.timezone).slice(0, 7)
  let usage = t.usage.find((u) => u.month === month)
  if (!usage) {
    usage = { month, smsCount: 0, smsCost: '0.00', emailCount: 0, optimizationsCount: 0 }
    t.usage.push(usage)
  }
  usage.optimizationsCount += 1
}

export const routePlanHandlers = [
  route<OptimizeRoutesBody>(
    'post',
    '/route-plans/optimize',
    ({ auth, body }) => {
      const t = auth.t
      if (!featuresOf(t).includes('route_optimization')) {
        throw paymentRequired('plan.feature_not_included', 'Plan ne uključuje optimizaciju ruta.')
      }
      const errors = new FieldErrors()
      const technicians = body.technicianIds.flatMap((id, index) => {
        const row = t.technicians.find((technician) => technician.id === id && technician.isActive)
        if (!row) errors.add(`technicianIds[${String(index)}]`, MESSAGES.notFound)
        return row ? [row] : []
      })
      const jobs = body.jobIds.flatMap((id, index) => {
        const row = t.jobs.find((job) => job.id === id && !job.deletedAt)
        if (!row) errors.add(`jobIds[${String(index)}]`, MESSAGES.notFound)
        else if (!PLANNABLE.includes(row.status))
          errors.add(`jobIds[${String(index)}]`, MESSAGES.notAllowed)
        return row ? [row] : []
      })
      errors.throwIfAny()

      const context = contextOf(t, body.date)
      const solvers = technicians.map((row) => solverTechnician(t, row, body.date))
      const solution = solve(
        solvers,
        jobs.map((job) => solverJob(t, job, body.date)),
        context,
      )
      // A new draft replaces the day's earlier ones
      for (const plan of t.routePlans) {
        if (plan.date === body.date && plan.status === 'draft') plan.status = 'discarded'
      }
      const plan = withTotals({
        id: newId(),
        date: body.date,
        status: 'draft',
        routes: toRoutes(solution, solvers, context),
        unassigned: solution.unassigned,
        createdAt: toIsoInstant(Date.now()),
        publishedAt: null,
      })
      t.routePlans.push(plan)
      countOptimization(t)
      return created(plan)
    },
    { roles: OFFICE_ROLES },
  ),

  route(
    'get',
    '/route-plans/{id}',
    ({ auth, params }) => ok(getRow(auth.t.routePlans, params.id)),
    { roles: OFFICE_ROLES },
  ),

  route<UpdateRoutePlanBody>(
    'put',
    '/route-plans/{id}',
    ({ auth, params, body }) => {
      const t = auth.t
      const plan = getRow(t.routePlans, params.id)
      if (plan.status !== 'draft') {
        throw conflict('route_plan.not_draft', 'Plan više nije nacrt.')
      }
      const known = new Set([
        ...plan.routes.flatMap((r) => r.stops.map((stop) => stop.jobId)),
        ...plan.unassigned.map((item) => item.jobId),
      ])
      const errors = new FieldErrors()
      const placed = new Map<string, number>()
      body.routes.forEach((entry, index) => {
        const technician = t.technicians.find(
          (row) => row.id === entry.technicianId && row.isActive,
        )
        if (!technician) errors.add(`routes[${String(index)}].technicianId`, MESSAGES.notFound)
        entry.jobIds.forEach((jobId, at) => {
          const path = `routes[${String(index)}].jobIds[${String(at)}]`
          const row = t.jobs.find((job) => job.id === jobId)
          if (!known.has(jobId) || !row) errors.add(path, MESSAGES.notFound)
          else if (row.requiredPeople <= 1 && placed.has(jobId))
            errors.add(path, MESSAGES.duplicate)
          placed.set(jobId, (placed.get(jobId) ?? 0) + 1)
        })
      })
      errors.throwIfAny()

      const context = contextOf(t, plan.date)
      const routes = body.routes.flatMap((entry) => {
        const row = t.technicians.find((technician) => technician.id === entry.technicianId)
        if (!row || entry.jobIds.length === 0) return []
        const jobs = entry.jobIds.flatMap((id) => {
          const job = t.jobs.find((candidate) => candidate.id === id)
          return job ? [solverJob(t, job, plan.date)] : []
        })
        const existing = plan.routes.find((r) => r.technicianId === entry.technicianId)
        return [
          {
            id: existing?.id ?? newId(),
            ...timeRoute(solverTechnician(t, row, plan.date), jobs, context).route,
          },
        ]
      })
      // Jobs taken out of every route are unassigned again; earlier reasons stay
      const dropped = [...known].filter((id) => !placed.has(id))
      const unassigned = dropped.map((jobId) => ({
        jobId,
        ...(plan.unassigned.find((item) => item.jobId === jobId) ?? {
          reason: 'other' as const,
          detail: 'Uklonjeno iz ruta.',
        }),
      }))
      const updated = withTotals({ ...plan, routes, unassigned })
      t.routePlans[t.routePlans.indexOf(plan)] = updated
      return ok(updated)
    },
    { roles: OFFICE_ROLES },
  ),

  route(
    'post',
    '/route-plans/{id}/publish',
    ({ auth, params }) => {
      const t = auth.t
      const plan = getRow(t.routePlans, params.id)
      if (plan.status !== 'draft') {
        throw conflict('route_plan.not_draft', 'Plan više nije nacrt.')
      }
      const now = toIsoInstant(Date.now())
      for (const other of t.routePlans) {
        if (other.date === plan.date && other.status === 'published') other.status = 'discarded'
      }
      for (const entry of plan.routes) {
        entry.stops.forEach((stop, index) => {
          const job = t.jobs.find((candidate) => candidate.id === stop.jobId)
          if (!job) return
          if (job.requiredPeople <= 1) {
            t.assignments = [
              ...t.assignments.filter((a) => a.jobId !== job.id),
              {
                jobId: job.id,
                technicianId: entry.technicianId,
                isLead: true,
                sequence: index,
                assignedAt: now,
              },
            ]
          } else {
            const own = t.assignments.find(
              (a) => a.jobId === job.id && a.technicianId === entry.technicianId,
            )
            if (own) own.sequence = index
            else {
              t.assignments.push({
                jobId: job.id,
                technicianId: entry.technicianId,
                isLead: !t.assignments.some((a) => a.jobId === job.id && a.isLead),
                sequence: index,
                assignedAt: now,
              })
            }
          }
          job.scheduledDate = plan.date
          job.scheduledStart = stop.eta ?? null
          const from = job.status
          if (from === 'new' || from === 'on_hold') {
            job.status = 'scheduled'
            if (from === 'on_hold') job.onHoldReason = null
            recordTransition(t, job, auth, from, 'scheduled')
          }
          touch(job)
        })
      }
      const published: RoutePlan = { ...plan, status: 'published', publishedAt: now }
      t.routePlans[t.routePlans.indexOf(plan)] = published
      return ok(published)
    },
    { roles: OFFICE_ROLES },
  ),
]
