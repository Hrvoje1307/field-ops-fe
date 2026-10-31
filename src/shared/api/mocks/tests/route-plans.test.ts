import { beforeEach, describe, expect, it } from 'vitest'

import type { DispatchBoard, Job, RoutePlan, Technician, Usage } from '@/shared/api/generated/model'
import { addDays, todayInTimeZone } from '@/shared/lib/datetime'
import { fixToday } from '@/shared/lib/test/fixed-today'

import { resetMockDb } from '../db'
import { isoWeekday } from '../lib/visit-order'
import { loginAs, type Session, tenantBySlug, USERS } from './client'

fixToday()

beforeEach(() => {
  resetMockDb()
})

/** The next working weekday after today (the seeded technicians work Monday to Friday). */
function workday(): string {
  let date = addDays(todayInTimeZone('Europe/Zagreb'), 1)
  while (isoWeekday(date) > 5) date = addDays(date, 1)
  return date
}

async function setup(email: string = USERS.alarmkoDispatcher) {
  const dispatcher = await loginAs(email)
  const date = workday()
  const board = (await dispatcher.get<DispatchBoard>(`/dispatch/board?date=${date}`)).body
  const technicians = (await dispatcher.get<Technician[]>('/technicians')).body.filter(
    (technician) => technician.isActive,
  )
  const jobIds = board.unassigned
    .filter((job) => job.status === 'new')
    .slice(0, 6)
    .map((job) => job.id)
  return { dispatcher, date, board, technicians, jobIds }
}

async function optimize(
  dispatcher: Session,
  date: string,
  technicians: Technician[],
  jobIds: string[],
) {
  return dispatcher.post<RoutePlan>('/route-plans/optimize', {
    date,
    technicianIds: technicians.map((technician) => technician.id),
    jobIds,
  })
}

describe('POST /route-plans/optimize', () => {
  it('stores a draft: every job is in one route or unassigned, with times in order', async () => {
    const { dispatcher, date, technicians, jobIds } = await setup()
    const response = await optimize(dispatcher, date, technicians, jobIds)
    expect(response.status).toBe(201)
    const plan = response.body
    expect(plan).toMatchObject({ date, status: 'draft', publishedAt: null })

    const stopped = plan.routes.flatMap((r) => r.stops.map((stop) => stop.jobId))
    const left = plan.unassigned.map((item) => item.jobId)
    expect([...stopped, ...left].sort()).toEqual([...jobIds].sort())

    for (const entry of plan.routes) {
      expect(entry.stops.map((stop) => stop.sequence)).toEqual(entry.stops.map((_, i) => i + 1))
      const times = entry.stops.flatMap((stop) => [stop.eta ?? '', stop.etd ?? ''])
      expect(times).toEqual([...times].sort())
      expect(entry.durationS).toBeGreaterThan(0)
    }
    expect(plan.totalDurationS).toBe(plan.routes.reduce((sum, r) => sum + (r.durationS ?? 0), 0))
    expect(plan.totalDistanceM).toBe(plan.routes.reduce((sum, r) => sum + (r.distanceM ?? 0), 0))

    const board = (await dispatcher.get<DispatchBoard>(`/dispatch/board?date=${date}`)).body
    expect(board.draftPlanId).toBe(plan.id)
    expect(board.publishedPlanId).toBeNull()
  })

  it("counts towards the month's usage and replaces the day's earlier draft", async () => {
    const { dispatcher, date, technicians, jobIds } = await setup()
    const month = date.slice(0, 7)
    const before = (await dispatcher.get<Usage>(`/tenant/usage?month=${month}`)).body
    const first = await optimize(dispatcher, date, technicians, jobIds)
    const second = await optimize(dispatcher, date, technicians, jobIds)
    const after = (await dispatcher.get<Usage>(`/tenant/usage?month=${month}`)).body
    expect(after.optimizationsCount).toBe(before.optimizationsCount + 2)
    expect((await dispatcher.get<RoutePlan>(`/route-plans/${first.body.id}`)).body.status).toBe(
      'discarded',
    )
    const board = (await dispatcher.get<DispatchBoard>(`/dispatch/board?date=${date}`)).body
    expect(board.draftPlanId).toBe(second.body.id)
  })

  it('the plan must include optimization: 402 for Bura klima (basic)', async () => {
    const dispatcher = await loginAs(USERS.buraDispatcher)
    const technicians = (await dispatcher.get<Technician[]>('/technicians')).body
    const response = await dispatcher.post('/route-plans/optimize', {
      date: workday(),
      technicianIds: technicians.map((technician) => technician.id).slice(0, 1),
      jobIds: [tenantBySlug('bura-klima').jobs[0]?.id],
    })
    expect(response.status).toBe(402)
  })

  it('refuses unknown technicians and jobs, empty lists and technicians', async () => {
    const { dispatcher, date, jobIds } = await setup()
    const unknown = '00000000-0000-7000-8000-000000000000'
    const bad = await dispatcher.post<{ errors: Record<string, string[]> }>(
      '/route-plans/optimize',
      { date, technicianIds: [unknown], jobIds: [unknown] },
    )
    expect(bad.status).toBe(400)
    expect(Object.keys(bad.body.errors)).toEqual(['technicianIds[0]', 'jobIds[0]'])
    const empty = await dispatcher.post('/route-plans/optimize', {
      date,
      technicianIds: [],
      jobIds,
    })
    expect(empty.status).toBe(400)
  })

  it('is office only', async () => {
    const ivan = await loginAs(USERS.ivan)
    expect(
      (await ivan.get(`/route-plans/${'0'.repeat(8)}-0000-7000-8000-000000000000`)).status,
    ).toBe(403)
  })
})

describe('PUT /route-plans/{id}', () => {
  it('rebuilds the routes in the given order, with new times; jobs left out are unassigned', async () => {
    const { dispatcher, date, technicians, jobIds } = await setup()
    const plan = (await optimize(dispatcher, date, technicians, jobIds)).body
    const entry = plan.routes.find((r) => r.stops.length >= 2)
    if (!entry) throw new Error('Seed needs a route with two stops')
    const reversed = entry.stops.map((stop) => stop.jobId).reverse()
    const dropped = reversed.slice(1)
    const first = reversed[0]

    const response = await dispatcher.put<RoutePlan>(`/route-plans/${plan.id}`, {
      routes: [{ technicianId: entry.technicianId, jobIds: [first] }],
    })
    expect(response.status).toBe(200)
    expect(response.body.routes).toHaveLength(1)
    expect(response.body.routes[0]?.stops.map((stop) => stop.jobId)).toEqual([first])
    const left = response.body.unassigned.map((item) => item.jobId)
    for (const id of dropped) expect(left).toContain(id)

    const swapped = await dispatcher.put<RoutePlan>(`/route-plans/${plan.id}`, {
      routes: [{ technicianId: entry.technicianId, jobIds: reversed }],
    })
    expect(swapped.body.routes[0]?.stops.map((stop) => stop.jobId)).toEqual(reversed)
    expect(swapped.body.totalDurationS).toBe(swapped.body.routes[0]?.durationS)
  })

  it('400 for a job that is not part of the plan, or put in two routes', async () => {
    const { dispatcher, date, technicians, jobIds } = await setup()
    const plan = (await optimize(dispatcher, date, technicians, jobIds.slice(0, 2))).body
    const outside = jobIds[2]
    const technicianId = technicians[0]?.id
    if (!outside || !technicianId) throw new Error('Seed needs more jobs')
    const response = await dispatcher.put<{ errors: Record<string, string[]> }>(
      `/route-plans/${plan.id}`,
      { routes: [{ technicianId, jobIds: [outside] }] },
    )
    expect(response.status).toBe(400)
    expect(Object.keys(response.body.errors)).toEqual(['routes[0].jobIds[0]'])

    const twice = await dispatcher.put<{ errors: Record<string, string[]> }>(
      `/route-plans/${plan.id}`,
      {
        routes: [
          { technicianId, jobIds: [jobIds[0]] },
          { technicianId: technicians[1]?.id, jobIds: [jobIds[0]] },
        ],
      },
    )
    expect(twice.status).toBe(400)
    expect(Object.keys(twice.body.errors)).toEqual(['routes[1].jobIds[0]'])
  })
})

describe('POST /route-plans/{id}/publish', () => {
  it("schedules the jobs at their planned times, in order, and discards the day's earlier plan", async () => {
    const { dispatcher, date, technicians, jobIds } = await setup()
    const first = (await optimize(dispatcher, date, technicians, jobIds)).body
    expect((await dispatcher.post<RoutePlan>(`/route-plans/${first.id}/publish`)).status).toBe(200)
    const second = (await optimize(dispatcher, date, technicians, jobIds.slice(0, 2))).body
    const published = await dispatcher.post<RoutePlan>(`/route-plans/${second.id}/publish`)
    expect(published.body).toMatchObject({ id: second.id, status: 'published' })
    expect(published.body.publishedAt).not.toBeNull()
    expect((await dispatcher.get<RoutePlan>(`/route-plans/${first.id}`)).body.status).toBe(
      'discarded',
    )

    for (const entry of second.routes) {
      for (const stop of entry.stops) {
        const job = (await dispatcher.get<Job>(`/jobs/${stop.jobId}`)).body
        expect(job.status).toBe('scheduled')
        expect(job.scheduledDate).toBe(date)
        expect(job.scheduledStart).toBe(stop.eta)
        expect(job.technicians.map((technician) => technician.id)).toEqual([entry.technicianId])
      }
    }
    const board = (await dispatcher.get<DispatchBoard>(`/dispatch/board?date=${date}`)).body
    expect(board.publishedPlanId).toBe(second.id)
    expect(board.draftPlanId).toBeNull()
    const column = board.columns.find((c) => c.technician.id === second.routes[0]?.technicianId)
    // Earlier published jobs of that technician stay; the plan's own keep their order
    const planned = second.routes[0]?.stops.map((stop) => stop.jobId) ?? []
    expect(column?.jobs.map((job) => job.id).filter((id) => planned.includes(id))).toEqual(planned)
  })

  it('409 once it is no longer a draft, for publishing and for corrections', async () => {
    const { dispatcher, date, technicians, jobIds } = await setup()
    const plan = (await optimize(dispatcher, date, technicians, jobIds)).body
    await dispatcher.post(`/route-plans/${plan.id}/publish`)
    expect((await dispatcher.post(`/route-plans/${plan.id}/publish`)).status).toBe(409)
    expect(
      (
        await dispatcher.put(`/route-plans/${plan.id}`, {
          routes: [{ technicianId: technicians[0]?.id, jobIds: [] }],
        })
      ).status,
    ).toBe(409)
  })

  it("another tenant's plan is not found", async () => {
    const { dispatcher, date, technicians, jobIds } = await setup()
    const plan = (await optimize(dispatcher, date, technicians, jobIds)).body
    const bura = await loginAs(USERS.buraDispatcher)
    expect((await bura.get(`/route-plans/${plan.id}`)).status).toBe(404)
  })
})
