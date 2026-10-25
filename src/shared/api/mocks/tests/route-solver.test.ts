import { describe, expect, it } from 'vitest'

import {
  type SolverContext,
  type SolverJob,
  type SolverTechnician,
  solve,
  timeRoute,
  toRoutes,
} from '../lib/route-solver'

const context: SolverContext = {
  date: '2026-10-27',
  timeZone: 'Europe/Zagreb',
  depotId: 'depot',
  skillNames: new Map([['s2', 'Druga']]),
  newRouteId: () => 'route',
}

const technician = (overrides: Partial<SolverTechnician> = {}): SolverTechnician => ({
  id: 't1',
  workStart: '08:00',
  workEnd: '16:00',
  worksThatDay: true,
  skillIds: ['s1'],
  base: { lat: 45.8, lng: 15.97 },
  ...overrides,
})

// 0.01° of latitude is about 1.1 km
const at = (north: number) => ({ lat: 45.8 + north, lng: 15.97 })

const job = (id: string, overrides: Partial<SolverJob> = {}): SolverJob => ({
  id,
  number: id,
  durationMin: 60,
  priorityRank: 1,
  point: at(0.05),
  requiredSkillIds: [],
  windowStart: null,
  windowEnd: null,
  fixedTechnicianIds: null,
  fixedStart: null,
  ...overrides,
})

describe('timeRoute', () => {
  it('drives from the depot, works the job, and returns', () => {
    const { route, late } = timeRoute(technician(), [job('a')], context)
    expect(late).toBeNull()
    expect(route.startTime).toBe('2026-10-27T07:00:00.000Z') // 08:00 in Zagreb (UTC+1)
    const [stop] = route.stops
    expect(stop?.travelFromPrevS).toBeGreaterThan(0)
    expect(Date.parse(stop?.etd ?? '') - Date.parse(stop?.eta ?? '')).toBe(3_600_000)
    expect(route.distanceM).toBeGreaterThan(0)
    expect(Date.parse(route.endTime ?? '')).toBeGreaterThan(Date.parse(stop?.etd ?? ''))
  })

  it('waits for the start of the window, and flags a window that is missed', () => {
    const waiting = timeRoute(technician(), [job('a', { windowStart: '10:00' })], context)
    expect(waiting.route.stops[0]?.eta).toBe('2026-10-27T09:00:00.000Z')
    const missed = timeRoute(technician(), [job('a', { windowEnd: '08:01' })], context)
    expect(missed.late).toBe('window')
  })

  it('flags a day that runs past closing time', () => {
    const long = [job('a', { durationMin: 300 }), job('b', { durationMin: 300 })]
    expect(timeRoute(technician(), long, context).late).toBe('hours')
  })
})

describe('solve', () => {
  it('puts a job where it costs the least travel (cheapest insertion)', () => {
    const jobs = [
      job('far', { point: at(0.2), priorityRank: 3 }),
      job('near', { point: at(0.02) }),
      job('mid', { point: at(0.1) }),
    ]
    const { orders } = solve([technician()], jobs, context)
    expect(orders.get('t1')?.map((j) => j.id)).toEqual(['near', 'mid', 'far'])
  })

  it('gives a job to the technician who is nearer', () => {
    const north = technician({ id: 'north', base: at(0.3) })
    const south = technician({ id: 'south', base: at(-0.3) })
    const { orders } = solve([north, south], [job('a', { point: at(0.28) })], context)
    expect([...orders.keys()]).toEqual(['north'])
  })

  it('leaves a job unassigned with the reason: skills (named), day off, coordinates, capacity', () => {
    const result = solve(
      [technician()],
      [
        job('skill', { requiredSkillIds: ['s2'] }),
        job('nowhere', { point: null }),
        job('huge', { durationMin: 600 }),
      ],
      context,
    )
    const reason = (id: string) => result.unassigned.find((item) => item.jobId === id)
    expect(reason('skill')).toMatchObject({
      reason: 'skills',
      detail: 'Nijedan monter nema vještinu: Druga',
    })
    expect(reason('nowhere')?.reason).toBe('missing_coordinates')
    expect(reason('huge')?.reason).toBe('capacity')

    const off = solve([technician({ worksThatDay: false })], [job('a')], context)
    expect(off.unassigned[0]?.reason).toBe('working_hours')
  })

  it('a job whose window cannot be met is unassigned for the time window', () => {
    const result = solve([technician()], [job('a', { windowEnd: '08:01' })], context)
    expect(result.unassigned[0]).toMatchObject({ jobId: 'a', reason: 'time_window' })
  })

  it('keeps locked and crew jobs with their assignees, at their set time', () => {
    const fixedStart = '2026-10-27T11:00:00.000Z' // 12:00
    const locked = job('locked', { fixedTechnicianIds: ['t1'], fixedStart, point: at(0.1) })
    const crew = job('crew', { fixedTechnicianIds: ['t1', 't2'], point: at(0.1) })
    const free = job('free', { point: at(0.02) })
    const solvers = [technician(), technician({ id: 't2' })]
    const { orders } = solve(solvers, [free, locked, crew], context)
    expect(orders.get('t1')?.map((j) => j.id)).toContain('locked')
    expect(orders.get('t1')?.map((j) => j.id)).toContain('crew')
    expect(orders.get('t2')?.map((j) => j.id)).toContain('crew')
    expect(orders.get('t2')?.map((j) => j.id)).not.toContain('locked')

    const [route] = toRoutes(solve([technician()], [locked], context), [technician()], context)
    expect(route?.stops[0]?.eta).toBe(fixedStart)
  })

  it('a fixed job whose assignees are not chosen stays out, with a reason', () => {
    const result = solve([technician()], [job('a', { fixedTechnicianIds: ['elsewhere'] })], context)
    expect(result.orders.size).toBe(0)
    expect(result.unassigned[0]?.reason).toBe('other')
  })
})
