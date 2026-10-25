import type { Route, RoutePlanUnassignedItem, UnassignedReason } from '@/shared/api/generated/model'
import { zonedDateTimeToInstant } from '@/shared/lib/datetime'

/**
 * A stand-in for the backend's VROOM solver: cheapest insertion by travel time. It
 * follows what the contract says about the result (locked and multi-person jobs stay
 * with their assignees, skills, working days and hours, windows, coordinates) and
 * nothing more; the real solver will give other routes.
 */

export interface Point {
  lat: number
  lng: number
}

export interface SolverTechnician {
  id: string
  /** `HH:mm` tenant-local. */
  workStart: string
  workEnd: string
  worksThatDay: boolean
  skillIds: readonly string[]
  /** Where the day starts and ends (the depot); null when it has no coordinates. */
  base: Point | null
}

export interface SolverJob {
  id: string
  durationMin: number
  priorityRank: number
  number: string
  point: Point | null
  requiredSkillIds: readonly string[]
  windowStart: string | null
  windowEnd: string | null
  /** Locked or for several people: these technicians keep the job. */
  fixedTechnicianIds: readonly string[] | null
  /** Its set start, kept when the job is fixed. */
  fixedStart: string | null
}

export interface SolverContext {
  date: string
  timeZone: string
  depotId: string | null
  skillNames: ReadonlyMap<string, string>
  newRouteId: () => string
}

const SPEED_KMH = 40
const ROAD_FACTOR = 1.3

function distanceM(a: Point, b: Point): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * 6_371_000 * Math.asin(Math.sqrt(h)) * ROAD_FACTOR)
}

const travelSeconds = (metres: number) => Math.round(metres / ((SPEED_KMH * 1000) / 3600))

const instantMs = (context: SolverContext, time: string) =>
  Date.parse(zonedDateTimeToInstant(context.date, time, context.timeZone))

interface Timed {
  route: Omit<Route, 'id'>
  /** The route cannot be driven as it is (past closing time, a window, a fixed start). */
  late: 'hours' | 'window' | 'fixed' | null
}

/** ETAs, travel and totals for a technician's jobs in the given order. */
export function timeRoute(
  technician: SolverTechnician,
  jobs: readonly SolverJob[],
  context: SolverContext,
): Timed {
  const start = instantMs(context, technician.workStart)
  const close = instantMs(context, technician.workEnd)
  let clock = start
  let at = technician.base
  let metres = 0
  let late: Timed['late'] = null
  const stops: Route['stops'] = jobs.map((job, index) => {
    const leg = at && job.point ? distanceM(at, job.point) : 0
    const travel = travelSeconds(leg)
    metres += leg
    let eta = clock + travel * 1000
    if (job.windowStart) eta = Math.max(eta, instantMs(context, job.windowStart))
    if (job.fixedStart) {
      const fixed = Date.parse(job.fixedStart)
      if (eta > fixed) late ??= 'fixed'
      else eta = fixed
    }
    if (job.windowEnd && eta > instantMs(context, job.windowEnd)) late ??= 'window'
    const etd = eta + job.durationMin * 60_000
    clock = etd
    at = job.point ?? at
    return {
      jobId: job.id,
      sequence: index + 1,
      eta: new Date(eta).toISOString(),
      etd: new Date(etd).toISOString(),
      travelFromPrevS: travel,
    }
  })
  const back = at && technician.base ? distanceM(at, technician.base) : 0
  metres += back
  const end = clock + travelSeconds(back) * 1000
  if (end > close) late ??= 'hours'
  return {
    route: {
      technicianId: technician.id,
      depotId: context.depotId,
      startTime: new Date(start).toISOString(),
      endTime: new Date(end).toISOString(),
      distanceM: metres,
      durationS: Math.round((end - start) / 1000),
      polyline: null,
      stops,
    },
    late,
  }
}

export interface Solution {
  /** Visit order per technician (only technicians with at least one job). */
  orders: Map<string, SolverJob[]>
  unassigned: RoutePlanUnassignedItem[]
}

const unassign = (
  job: SolverJob,
  reason: UnassignedReason,
  detail: string,
): RoutePlanUnassignedItem => ({ jobId: job.id, reason, detail })

export function solve(
  technicians: readonly SolverTechnician[],
  jobs: readonly SolverJob[],
  context: SolverContext,
): Solution {
  const byId = new Map(technicians.map((technician) => [technician.id, technician]))
  const orders = new Map<string, SolverJob[]>(technicians.map((technician) => [technician.id, []]))
  const unassigned: RoutePlanUnassignedItem[] = []

  // Fixed jobs stay with their assignees, in the order of their set times
  const fixed = jobs
    .filter((job) => job.fixedTechnicianIds)
    .sort(
      (a, b) =>
        (a.fixedStart ?? '').localeCompare(b.fixedStart ?? '') || a.number.localeCompare(b.number),
    )
  for (const job of fixed) {
    const owners = (job.fixedTechnicianIds ?? []).filter((id) => byId.has(id))
    if (owners.length === 0) {
      unassigned.push(
        unassign(
          job,
          'other',
          'Nalog je zaključan ili za više montera, a nijedan od njih nije odabran.',
        ),
      )
      continue
    }
    for (const id of owners) orders.get(id)?.push(job)
  }

  const free = jobs
    .filter((job) => !job.fixedTechnicianIds)
    .sort(
      (a, b) =>
        b.priorityRank - a.priorityRank ||
        (a.windowStart ?? '99:99').localeCompare(b.windowStart ?? '99:99') ||
        a.number.localeCompare(b.number),
    )

  for (const job of free) {
    if (!job.point) {
      unassigned.push(unassign(job, 'missing_coordinates', 'Lokacija nema koordinate.'))
      continue
    }
    const working = technicians.filter((technician) => technician.worksThatDay)
    if (working.length === 0) {
      unassigned.push(unassign(job, 'working_hours', 'Nijedan odabrani monter taj dan ne radi.'))
      continue
    }
    const skilled = working.filter((technician) =>
      job.requiredSkillIds.every((skill) => technician.skillIds.includes(skill)),
    )
    if (skilled.length === 0) {
      const names = job.requiredSkillIds.map((id) => context.skillNames.get(id) ?? id).join(', ')
      unassigned.push(unassign(job, 'skills', `Nijedan monter nema vještinu: ${names}`))
      continue
    }

    let best: { technician: SolverTechnician; at: number; cost: number } | null = null
    let windowMissed = false
    for (const technician of skilled) {
      const current = orders.get(technician.id) ?? []
      const before = timeRoute(technician, current, context).route.durationS ?? 0
      for (let at = 0; at <= current.length; at += 1) {
        const candidate = [...current.slice(0, at), job, ...current.slice(at)]
        const timed = timeRoute(technician, candidate, context)
        if (timed.late === 'window' || timed.late === 'fixed') windowMissed = true
        if (timed.late) continue
        const cost = (timed.route.durationS ?? 0) - before
        if (!best || cost < best.cost) best = { technician, at, cost }
      }
    }
    if (best) {
      orders.get(best.technician.id)?.splice(best.at, 0, job)
    } else if (windowMissed) {
      unassigned.push(unassign(job, 'time_window', 'Ne stiže u traženi vremenski prozor.'))
    } else {
      unassigned.push(unassign(job, 'capacity', 'Nijedan monter nema dovoljno vremena taj dan.'))
    }
  }

  for (const [id, order] of orders) if (order.length === 0) orders.delete(id)
  return { orders, unassigned }
}

/** The solution as the contract's routes (ids assigned here). */
export function toRoutes(
  solution: Solution,
  technicians: readonly SolverTechnician[],
  context: SolverContext,
): Route[] {
  return technicians.flatMap((technician) => {
    const order = solution.orders.get(technician.id)
    if (!order) return []
    return [{ id: context.newRouteId(), ...timeRoute(technician, order, context).route }]
  })
}
