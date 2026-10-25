import { beforeEach, describe, expect, it } from 'vitest'

import type { DispatchBoard, Job } from '@/shared/api/generated/model'
import { addDays, todayInTimeZone } from '@/shared/lib/datetime'

import { getDb, resetMockDb } from '../db'
import { jobId, loginAs, tenantBySlug, USERS } from './client'

beforeEach(() => {
  resetMockDb()
})

const today = () => todayInTimeZone('Europe/Zagreb')
const board = async (date: string, user: string = USERS.alarmkoDispatcher) =>
  (await loginAs(user)).get<DispatchBoard>(`/dispatch/board?date=${date}`)

/** ISO weekday (1 = Monday) of a plain date. */
const weekday = (date: string) => {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay()
  return day === 0 ? 7 : day
}

describe('GET /dispatch/board', () => {
  it("a column per active technician with that day's jobs, in visit order", async () => {
    const response = await board(today())
    expect(response.status).toBe(200)
    const t = tenantBySlug('alarmko')
    const active = t.technicians.filter((technician) => technician.isActive)
    expect(response.body.columns).toHaveLength(active.length)
    for (const column of response.body.columns) {
      const row = t.technicians.find((technician) => technician.id === column.technician.id)
      expect(column.workStart).toBe(row?.workStart)
      expect(column.isWorkingDay).toBe(row?.workingDays.includes(weekday(today())))
      expect(column.jobs.every((job) => job.scheduledDate === today())).toBe(true)
      expect(
        column.jobs.every((job) =>
          job.technicians.some((tech) => tech.id === column.technician.id),
        ),
      ).toBe(true)
      expect(column.plannedMinutes).toBe(column.jobs.reduce((sum, job) => sum + job.durationMin, 0))
    }
    expect(response.body.columns.flatMap((column) => column.jobs).length).toBeGreaterThan(0)
  })

  it('queue: new jobs of any date, most urgent first; no cancelled jobs anywhere', async () => {
    const { body } = await board(today())
    expect(body.unassigned.length).toBeGreaterThan(0)
    expect(
      body.unassigned.every((job) => job.status === 'new' || job.technicians.length === 0),
    ).toBe(true)
    const ranks = { low: 0, normal: 1, high: 2, urgent: 3 }
    const order = body.unassigned.map((job) => ranks[job.priority])
    expect(order).toEqual([...order].sort((a, b) => b - a))
    const all = [...body.unassigned, ...body.columns.flatMap((column) => column.jobs)]
    expect(all.some((job) => job.status === 'cancelled')).toBe(false)
  })

  it('queue: a job scheduled for the day without technicians, for that day only', async () => {
    const t = tenantBySlug('alarmko')
    const row = t.jobs.find(
      (job) => job.status === 'scheduled' && job.scheduledDate === today() && !job.deletedAt,
    )
    if (!row) throw new Error('Seed needs a scheduled job today')
    const db = getDb()
    const tenant = db.tenants[t.tenant.id]
    if (!tenant) throw new Error('No tenant')
    tenant.assignments = tenant.assignments.filter((a) => a.jobId !== row.id)

    const queued = (await board(today())).body.unassigned.map((job) => job.id)
    expect(queued).toContain(row.id)
    const otherDay = (await board(addDays(today(), 3))).body.unassigned.map((job) => job.id)
    expect(otherDay).not.toContain(row.id)
  })

  it('assigning a queued job moves it into the column', async () => {
    const dispatcher = await loginAs(USERS.alarmkoDispatcher)
    const id = jobId('alarmko', 'Sirena se oglašava bez razloga')
    const before = (await dispatcher.get<Job>(`/jobs/${id}`)).body
    const tomorrow = addDays(today(), 1)
    const column = (await board(tomorrow)).body.columns[0]
    if (!column) throw new Error('No technicians')
    const assigned = await dispatcher.post<Job>(`/jobs/${id}/assign`, {
      technicianIds: [column.technician.id],
      scheduledDate: tomorrow,
      version: before.version,
    })
    expect(assigned.body.status).toBe('scheduled')
    const after = (await board(tomorrow)).body
    expect(after.unassigned.some((job) => job.id === id)).toBe(false)
    expect(
      after.columns
        .find((c) => c.technician.id === column.technician.id)
        ?.jobs.map((job) => job.id),
    ).toContain(id)
  })

  it('assigning with a position makes room: the others are numbered again', async () => {
    const dispatcher = await loginAs(USERS.alarmkoDispatcher)
    const tomorrow = addDays(today(), 1)
    const queued = (await board(tomorrow)).body.unassigned.filter((job) => job.status === 'new')
    const technician = (await board(tomorrow)).body.columns[0]?.technician
    if (queued.length < 3 || !technician) throw new Error('Seed needs three queued jobs')
    const ids = queued.slice(0, 3).map((job) => job.id)
    const place = async (id: string, sequence: number) =>
      dispatcher.post<Job>(`/jobs/${id}/assign`, {
        technicianIds: [technician.id],
        scheduledDate: tomorrow,
        sequence,
      })
    const order = async () =>
      (await board(tomorrow)).body.columns
        .find((c) => c.technician.id === technician.id)
        ?.jobs.map((job) => job.id)
        .filter((id) => ids.includes(id))

    await place(ids[0] ?? '', 0)
    await place(ids[1] ?? '', 1)
    expect(await order()).toEqual([ids[0], ids[1]])
    await place(ids[2] ?? '', 0)
    expect(await order()).toEqual([ids[2], ids[0], ids[1]])
    await place(ids[2] ?? '', 99)
    expect(await order()).toEqual([ids[0], ids[1], ids[2]])
  })

  it('is office only, and each tenant sees its own technicians', async () => {
    expect((await board(today(), USERS.petra)).status).toBe(403)
    const bura = (await board(today(), USERS.buraDispatcher)).body
    const buraTechs = tenantBySlug('bura-klima').technicians.map((technician) => technician.id)
    expect(bura.columns.every((column) => buraTechs.includes(column.technician.id))).toBe(true)
  })
})
